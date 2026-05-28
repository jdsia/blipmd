export interface NoteMetadata {
  title: string;
  tags: string[];
  created: string;
  [key: string]: any;
}

export function parseNote(
  fileContent: string,
  fallbackTitle = "Untitled",
): { metadata: NoteMetadata; content: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: {
        title: fallbackTitle,
        tags: [],
        created: new Date().toISOString().split("T")[0],
      },
      content: fileContent,
    };
  }

  const yamlBlock = match[1];
  const content = match[2];
  const metadata: NoteMetadata = {
    title: fallbackTitle,
    tags: [],
    created: new Date().toISOString().split("T")[0],
  };

  const lines = yamlBlock.split("\n");
  let currentKey = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if it's a list item under active key (e.g. - dev)
    if (trimmed.startsWith("-") && currentKey === "tags") {
      const tagVal = trimmed.slice(1).trim().replace(/['"]/g, "");
      if (tagVal) {
        metadata.tags.push(tagVal);
      }
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let val = line.slice(colonIndex + 1).trim();
    const lowerKey = key.toLowerCase();
    currentKey = key;

    if (lowerKey === "tags") {
      if (!val) {
        metadata.tags = [];
        continue;
      }
      if (val.startsWith("[") && val.endsWith("]")) {
        metadata.tags = val
          .slice(1, -1)
          .split(",")
          .map((t) => t.trim().replace(/['"]/g, ""))
          .filter(Boolean);
      } else {
        metadata.tags = val
          .split(",")
          .map((t) => t.trim().replace(/['"]/g, ""))
          .filter(Boolean);
      }
    } else {
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (["created", "date", "created_at", "date_created"].includes(lowerKey)) {
        // Extract YYYY-MM-DD from date string if possible
        const dateMatch = val.match(/^\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          metadata.created = dateMatch[0];
        } else {
          metadata.created = val;
        }
      } else {
        metadata[key] = val;
      }
    }
  }

  if (metadata.title) {
    metadata.title = String(metadata.title);
  } else {
    metadata.title = fallbackTitle;
  }

  return { metadata, content };
}

export function stringifyNote(content: string, metadata: NoteMetadata): string {
  let yaml = "---\n";
  yaml += `title: "${metadata.title.replace(/"/g, '\\"')}"\n`;
  yaml += `tags: [${metadata.tags.join(", ")}]\n`;
  yaml += `created: ${metadata.created || new Date().toISOString().split("T")[0]}\n`;
  yaml += "---\n";
  return yaml + content;
}
