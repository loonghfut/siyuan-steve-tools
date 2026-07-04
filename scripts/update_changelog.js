import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';

// Utility to prompt the user for input
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    }));
}

// Function to get current date in Chinese format
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
}

// Function to get git commits since last tag
function getCommitsSinceLastTag() {
    try {
        // Get the latest tag
        const latestTag = execSync('git tag --sort=-creatordate | head -n 1', { encoding: 'utf8' }).trim();
        
        if (latestTag) {
            // Get commits since the latest tag
            const commits = execSync(`git log ${latestTag}..HEAD --pretty=format:"- %s (%an)"`, { encoding: 'utf8' }).trim();
            return { commits, latestTag };
        } else {
            // If no tags exist, get all commits
            const commits = execSync('git log --pretty=format:"- %s (%an)"', { encoding: 'utf8' }).trim();
            return { commits, latestTag: null };
        }
    } catch (error) {
        console.error('获取 Git 提交记录时出错:', error.message);
        return { commits: '', latestTag: null };
    }
}

// Function to update README.zh-CN.md
function updateReadmeChangelog(version, changelogContent) {
    const readmePath = path.join(process.cwd(), 'README.zh-CN.md');
    
    if (!fs.existsSync(readmePath)) {
        console.error('错误：README.zh-CN.md 文件不存在');
        return false;
    }
    
    try {
        const content = fs.readFileSync(readmePath, 'utf8');
        const currentDate = getCurrentDate();
        
        // Create new changelog entry
        const newEntry = `
### ${version} (${currentDate})
${changelogContent}
`;
        
        // Find the position after "#### 更新日志:"
        const changelogMarker = '#### 更新日志:';
        const markerIndex = content.indexOf(changelogMarker);
        
        if (markerIndex === -1) {
            console.error('错误：在 README.zh-CN.md 中未找到 "#### 更新日志:" 标记');
            return false;
        }
        
        // Find the end of the line containing the marker
        const lineEnd = content.indexOf('\n', markerIndex);
        if (lineEnd === -1) {
            console.error('错误：无法找到更新日志标记后的换行符');
            return false;
        }
        
        // Find the next "####" section to determine where changelog section ends
        const beforeMarker = content.substring(0, lineEnd + 1);
        const afterMarkerContent = content.substring(lineEnd + 1);
        
        // Find the next section starting with "####"
        const nextSectionMatch = afterMarkerContent.match(/\n#### /);
        let afterChangelog = '';
        
        if (nextSectionMatch) {
            const nextSectionIndex = nextSectionMatch.index;
            afterChangelog = afterMarkerContent.substring(nextSectionIndex);
        } else {
            // If no next section found, keep everything after
            afterChangelog = '\n' + afterMarkerContent;
        }
        
        // Create the updated content with only the latest changelog
        const updatedContent = beforeMarker + newEntry + '\n更多详见[提交记录](https://github.com/loonghfut/siyuan-steve-tools/commits/main-2/)\n' + afterChangelog;
        
        // Write the updated content back to the file
        fs.writeFileSync(readmePath, updatedContent, 'utf8');
        console.log('✅ README.zh-CN.md 已成功更新');
        return true;
    } catch (error) {
        console.error('更新 README.zh-CN.md 时出错:', error.message);
        return false;
    }
}

// Main script
(async function () {
    try {
        console.log('🔄 开始更新 README.zh-CN.md 中的更新日志\n');
        
        // Get current version from plugin.json
        const pluginJsonPath = path.join(process.cwd(), 'plugin.json');
        let currentVersion = '';
        
        if (fs.existsSync(pluginJsonPath)) {
            const pluginData = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
            currentVersion = pluginData.version || '';
        }
        
        if (currentVersion) {
            console.log(`📦 当前版本: v${currentVersion}`);
        }
        
        // Get commits since last tag
        const { commits, latestTag } = getCommitsSinceLastTag();
        
        if (latestTag) {
            console.log(`📝 自标签 ${latestTag} 以来的提交:`);
        } else {
            console.log(`📝 所有提交记录:`);
        }
        
        if (commits) {
            console.log(commits);
        } else {
            console.log('没有找到新的提交记录');
        }
        
        console.log('\n');
        
        // Ask user for version
        let version = '';
        if (currentVersion) {
            const useCurrentVersion = await promptUser(`是否使用当前版本 v${currentVersion}? (Y/n): `);
            if (!useCurrentVersion.toLowerCase().startsWith('n')) {
                version = `v${currentVersion}`;
            }
        }
        
        if (!version) {
            version = await promptUser('请输入版本号 (例如 v1.0.0): ');
        }
        
        if (!version) {
            console.log('❌ 版本号不能为空');
            return;
        }
        
        // Ask user for changelog content
        console.log('\n请输入更新日志内容 (每行一个条目，输入空行结束):');
        let changelogLines = [];
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        for await (const line of rl) {
            if (line.trim() === '') {
                break;
            }
            changelogLines.push(line.startsWith('- ') ? line : `- ${line}`);
        }
        rl.close();
        
        let changelogContent = '';
        if (changelogLines.length > 0) {
            changelogContent = changelogLines.join('\n');
        } else if (commits) {
            // Use git commits if no manual input
            const useGitCommits = await promptUser('没有输入更新内容，是否使用 Git 提交记录? (Y/n): ');
            if (!useGitCommits.toLowerCase().startsWith('n')) {
                changelogContent = commits;
            }
        }
        
        if (!changelogContent) {
            console.log('❌ 更新日志内容不能为空');
            return;
        }
        
        // Update README
        const success = updateReadmeChangelog(version, changelogContent);
        
        if (success) {
            // Ask if user wants to commit changes
            const shouldCommit = await promptUser('是否提交更改到 Git? (Y/n): ');
            if (!shouldCommit.toLowerCase().startsWith('n')) {
                try {
                    execSync('git add README.zh-CN.md', { stdio: 'inherit' });
                    execSync(`git commit -m "docs: 更新 ${version} 版本的更新日志"`, { stdio: 'inherit' });
                    console.log('✅ 更改已提交到 Git');
                    
                    const shouldPush = await promptUser('是否推送到远程仓库? (Y/n): ');
                    if (!shouldPush.toLowerCase().startsWith('n')) {
                        execSync('git push', { stdio: 'inherit' });
                        console.log('✅ 更改已推送到远程仓库');
                    }
                } catch (error) {
                    console.error('❌ Git 操作失败:', error.message);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ 脚本执行出错:', error.message);
    }
})();
