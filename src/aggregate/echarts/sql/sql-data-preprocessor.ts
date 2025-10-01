/**
 * SQL数据预处理器
 * 用于在数据传入ECharts前进行字段转换和数据清洗
 */

/**
 * 笔记本信息接口
 */
interface NotebookInfo {
  id: string;
  name: string;
  icon: string;
  sort: number;
  sortMode: number;
  closed: boolean;
  newFlashcardCount: number;
  dueFlashcardCount: number;
  flashcardCount: number;
}

/**
 * SQL查询返回的行数据类型
 */
interface SqlRow {
  [key: string]: any;
  box?: string;  // 笔记本ID
  ial?: string;  // IAL属性字符串
}

/**
 * 预处理选项
 */
export interface PreprocessOptions {
  /** 是否转换box字段(ID -> name) */
  convertBoxIdToName?: boolean;
  /** 是否转换时间戳字段为可读格式 */
  convertTimestamps?: boolean;
  /** 时间戳格式化选项 */
  timestampFormat?: 'datetime' | 'date' | 'time' | 'full';
  /** 是否解析ial字段 */
  parseIAL?: boolean;
  /** 是否输出调试信息 */
  debug?: boolean;
  /** 自定义笔记本列表(如果不使用全局变量) */
  customNotebooks?: NotebookInfo[];
}

/**
 * SQL数据预处理器类
 */
export class SqlDataPreprocessor {
  private notebooksMap: Map<string, string> = new Map();
  private options: PreprocessOptions;

  constructor(options: PreprocessOptions = {}) {
    this.options = {
      convertBoxIdToName: true,
      convertTimestamps: true,
      timestampFormat: 'datetime',
      parseIAL: true,
      debug: false,
      ...options
    };
    this.initNotebooksMap();
  }

  /**
   * 初始化笔记本ID到name的映射表
   */
  private initNotebooksMap(): void {
    try {
      // 优先使用自定义笔记本列表
      if (this.options.customNotebooks && Array.isArray(this.options.customNotebooks)) {
        this.buildNotebooksMap(this.options.customNotebooks);
        return;
      }

      // 尝试从全局变量获取
      if (typeof window !== 'undefined' && (window as any).siyuan?.notebooks) {
        const notebooks = (window as any).siyuan.notebooks as NotebookInfo[];
        this.buildNotebooksMap(notebooks);
        
        if (this.options.debug) {
          console.log('📚 从全局变量加载笔记本列表:', notebooks.length, '个');
        }
      } else {
        if (this.options.debug) {
          console.warn('⚠️ 未找到 window.siyuan.notebooks,box字段转换将失败');
        }
      }
    } catch (e) {
      console.error('❌ 初始化笔记本映射表失败:', e);
    }
  }

  /**
   * 构建ID到name的映射表
   */
  private buildNotebooksMap(notebooks: NotebookInfo[]): void {
    this.notebooksMap.clear();
    notebooks.forEach(nb => {
      this.notebooksMap.set(nb.id, nb.name);
    });
  }

  /**
   * 将box字段的ID转换为name
   */
  private convertBoxField(boxId: string): string {
    if (!boxId) return boxId;
    
    const name = this.notebooksMap.get(boxId);
    
    if (this.options.debug && !name) {
      console.warn(`⚠️ 未找到笔记本ID的映射: ${boxId}`);
    }
    
    return name || boxId; // 如果找不到映射,返回原ID
  }

  /**
   * 将思源笔记时间戳转换为人类可读格式
   * @param timestamp 思源笔记时间戳格式: 20250930230210
   * @returns 格式化后的时间字符串
   */
  private convertTimestamp(timestamp: string | number): string {
    if (!timestamp) return String(timestamp);
    
    const ts = String(timestamp);
    
    // 验证格式: 14位数字 YYYYMMDDHHMMSS
    if (!/^\d{14}$/.test(ts)) {
      return ts; // 不是有效的时间戳格式,返回原值
    }
    
    try {
      // 解析时间戳: 20250930230210 -> 2025-09-30 23:02:10
      const year = ts.substring(0, 4);
      const month = ts.substring(4, 6);
      const day = ts.substring(6, 8);
      const hour = ts.substring(8, 10);
      const minute = ts.substring(10, 12);
      const second = ts.substring(12, 14);
      
      const format = this.options.timestampFormat || 'datetime';
      
      switch (format) {
        case 'date':
          // 只返回日期: 2025-09-30
          return `${year}-${month}-${day}`;
        
        case 'time':
          // 只返回时间: 23:02:10
          return `${hour}:${minute}:${second}`;
        
        case 'full':
          // 完整格式: 2025年09月30日 23:02:10
          return `${year}年${month}月${day}日 ${hour}:${minute}:${second}`;
        
        case 'datetime':
        default:
          // 标准ISO格式: 2025-09-30 23:02:10
          return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
      }
    } catch (e) {
      if (this.options.debug) {
        console.warn(`⚠️ 时间戳转换失败: ${timestamp}`, e);
      }
      return ts;
    }
  }

  /**
   * 解析IAL(Inline Attribute List)字符串
   * @param ial IAL字符串,格式: {: id="xxx" updated="yyy" custom-attr="zzz"}
   * @returns 解析后的键值对对象
   */
  private parseIAL(ial: string): Record<string, string> {
    if (!ial || typeof ial !== 'string') return {};
    
    try {
      // 移除前后的 {: 和 }
      let content = ial.trim();
      if (content.startsWith('{:')) {
        content = content.substring(2);
      }
      if (content.endsWith('}')) {
        content = content.substring(0, content.length - 1);
      }
      content = content.trim();
      
      // 使用正则提取所有 key="value" 对
      const result: Record<string, string> = {};
      const regex = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const key = match[1];
        const value = match[2];
        result[key] = value;
        
        if (this.options.debug) {
          console.log(`  📋 解析IAL属性: ${key} = "${value}"`);
        }
      }
      
      return result;
    } catch (e) {
      if (this.options.debug) {
        console.warn('⚠️ IAL解析失败:', ial, e);
      }
      return {};
    }
  }

  /**
   * 获取IAL中所有的字段名称
   * @param ial IAL字符串
   * @returns 字段名称数组
   */
  public getIALKeys(ial: string): string[] {
    const parsed = this.parseIAL(ial);
    return Object.keys(parsed);
  }

  /**
   * 获取IAL中指定字段的值
   * @param ial IAL字符串
   * @param key 字段名
   * @returns 字段值,如果不存在返回undefined
   */
  public getIALValue(ial: string, key: string): string | undefined {
    const parsed = this.parseIAL(ial);
    return parsed[key];
  }

  /**
   * 预处理单行数据
   */
  private preprocessRow(row: SqlRow): SqlRow {
    if (!row) return row;

    const processedRow = { ...row };

    // 转换box字段
    if (this.options.convertBoxIdToName && processedRow.box) {
      const originalBox = processedRow.box;
      processedRow.box = this.convertBoxField(originalBox);
      
      if (this.options.debug && processedRow.box !== originalBox) {
        console.log(`🔄 box字段转换: ${originalBox} -> ${processedRow.box}`);
      }
    }

    // 转换时间戳字段
    if (this.options.convertTimestamps) {
      // 转换 created 字段
      if (processedRow.created) {
        const originalCreated = processedRow.created;
        processedRow.created = this.convertTimestamp(originalCreated);
        
        if (this.options.debug && processedRow.created !== String(originalCreated)) {
          console.log(`🕐 created字段转换: ${originalCreated} -> ${processedRow.created}`);
        }
      }
      
      // 转换 updated 字段
      if (processedRow.updated) {
        const originalUpdated = processedRow.updated;
        processedRow.updated = this.convertTimestamp(originalUpdated);
        
        if (this.options.debug && processedRow.updated !== String(originalUpdated)) {
          console.log(`🕐 updated字段转换: ${originalUpdated} -> ${processedRow.updated}`);
        }
      }
    }

    // 解析IAL字段
    if (this.options.parseIAL && processedRow.ial) {
      const ialParsed = this.parseIAL(processedRow.ial);
      
      if (this.options.debug && Object.keys(ialParsed).length > 0) {
        console.log(`📋 IAL字段解析: 提取了 ${Object.keys(ialParsed).length} 个属性`);
      }
      
      // 将解析后的IAL属性作为新字段添加到行数据中
      // 使用 ial_ 前缀避免与原有字段冲突
      Object.entries(ialParsed).forEach(([key, value]) => {
        const fieldName = `ial_${key}`;
        processedRow[fieldName] = value;
        
        // 如果IAL中包含时间戳格式的字段,也进行转换
        if (this.options.convertTimestamps && /^\d{14}$/.test(value)) {
          processedRow[fieldName] = this.convertTimestamp(value);
        }
      });
      
      // 保留原始ial字段和解析结果(转为JSON字符串避免显示[object Object])
      processedRow.ial_parsed = JSON.stringify(ialParsed);
      processedRow.ial_keys = Object.keys(ialParsed).join(', ');
    }

    return processedRow;
  }

  /**
   * 预处理SQL查询结果数组
   */
  public preprocess(rows: SqlRow[]): SqlRow[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows;
    }

    if (this.options.debug) {
      console.group('🔧 SQL数据预处理');
      console.log('📊 原始数据行数:', rows.length);
      console.log('📄 第一行数据(处理前):', rows[0]);
    }

    // 第一步: 预处理所有行
    const processedRows = rows.map(row => this.preprocessRow(row));

    // 第二步: 如果启用了IAL解析,收集所有IAL字段并填充默认值
    if (this.options.parseIAL) {
      // 收集所有出现过的IAL字段
      const allIALKeys = new Set<string>();
      processedRows.forEach(row => {
        Object.keys(row).forEach(key => {
          if (key.startsWith('ial_') && key !== 'ial_parsed' && key !== 'ial_keys') {
            allIALKeys.add(key);
          }
        });
      });

      // 为每一行填充缺失的IAL字段,默认值为 "无"
      if (allIALKeys.size > 0) {
        processedRows.forEach(row => {
          allIALKeys.forEach(key => {
            if (!(key in row)) {
              row[key] = '无';
            }
          });
        });

        if (this.options.debug) {
          console.log('📋 发现的IAL字段:', Array.from(allIALKeys));
          console.log('📋 已为缺失字段填充默认值 "无"');
        }
      }
    }

    if (this.options.debug) {
      console.log('📄 第一行数据(处理后):', processedRows[0]);
      
      // 统计box字段转换情况
      if (this.options.convertBoxIdToName) {
        const boxFields = processedRows.filter(r => r.box);
        const uniqueBoxes = new Set(boxFields.map(r => r.box));
        console.log('📚 涉及的笔记本:', Array.from(uniqueBoxes));
        console.log('📚 笔记本映射表大小:', this.notebooksMap.size);
      }
      
      console.groupEnd();
    }

    return processedRows;
  }

  /**
   * 获取笔记本名称(静态方法,用于单个ID转换)
   */
  public static getNotebookName(boxId: string): string {
    if (!boxId) return boxId;
    
    try {
      if (typeof window !== 'undefined' && (window as any).siyuan?.notebooks) {
        const notebooks = (window as any).siyuan.notebooks as NotebookInfo[];
        const notebook = notebooks.find(nb => nb.id === boxId);
        return notebook?.name || boxId;
      }
    } catch (e) {
      console.error('获取笔记本名称失败:', e);
    }
    
    return boxId;
  }

  /**
   * 重新加载笔记本列表(用于动态更新)
   */
  public reloadNotebooks(notebooks?: NotebookInfo[]): void {
    if (notebooks) {
      this.buildNotebooksMap(notebooks);
    } else {
      this.initNotebooksMap();
    }
    
    if (this.options.debug) {
      console.log('🔄 已重新加载笔记本映射表,当前大小:', this.notebooksMap.size);
    }
  }

  /**
   * 获取当前映射表信息(用于调试)
   */
  public getMapInfo(): { size: number; entries: Array<[string, string]> } {
    return {
      size: this.notebooksMap.size,
      entries: Array.from(this.notebooksMap.entries())
    };
  }
}

/**
 * 创建默认预处理器实例的工厂函数
 */
export function createPreprocessor(options?: PreprocessOptions): SqlDataPreprocessor {
  return new SqlDataPreprocessor(options);
}

/**
 * 快捷预处理函数(使用默认配置)
 */
export function preprocessSqlData(rows: SqlRow[], options?: PreprocessOptions): SqlRow[] {
  const preprocessor = new SqlDataPreprocessor(options);
  return preprocessor.preprocess(rows);
}
