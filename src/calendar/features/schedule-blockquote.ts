type BlockAttributeValue = string | number | boolean | null | undefined;

export type ScheduleBlockAttributes = Record<string, BlockAttributeValue>;

function escapeAttributeValue(value: BlockAttributeValue): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/\r?\n/g, ' ');
}

function serializeBlockAttributes(attributes: ScheduleBlockAttributes): string {
    return Object.entries(attributes)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([name, value]) => `${name}="${escapeAttributeValue(value)}"`)
        .join(' ');
}

/** Wraps schedule Markdown in a SiYuan blockquote container. */
export function createScheduleBlockquoteMarkdown(
    body: string,
    attributes: ScheduleBlockAttributes = {},
): string {
    const normalizedBody = body.replace(/\r\n?/g, '\n').trimEnd();
    const quotedBody = normalizedBody
        .split('\n')
        .map(line => line.length > 0 ? `> ${line}` : '>')
        .join('\n');
    const serializedAttributes = serializeBlockAttributes(attributes);

    return serializedAttributes
        ? `${quotedBody}\n{: ${serializedAttributes}}`
        : quotedBody;
}

/** Creates the initial empty schedule container using Kramdown block syntax. */
export function createEmptyScheduleBlockquoteMarkdown(
    blockId: string,
    headingBlockId: string,
    paragraphBlockId: string,
    attributes: ScheduleBlockAttributes = {},
): string {
    const body = [
        '#### ',
        `{: id="${headingBlockId}"}`,
        '',
        `{: id="${paragraphBlockId}"}`,
    ].join('\n');
    return createScheduleBlockquoteMarkdown(body, { id: blockId, ...attributes });
}

/** Detects a blockquote whose child blocks contain no user-entered content. */
export function isEmptyScheduleBlockquoteMarkdown(markdown: string): boolean {
    return !markdown
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/^\s*>\s?/, '').trim())
        .filter(line => line && !/^\{:[^}]*\}$/.test(line))
        .some(line => !/^#{1,6}$/.test(line));
}
