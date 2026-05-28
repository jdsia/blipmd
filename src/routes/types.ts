export interface Tab {
  id: string; // Unique ID or filePath
  title: string;
  content: string;
  tags: string; // Comma separated for easy editing in input
  created: string;
  isNew: boolean;
  filePath: string;
  isSaved: boolean;
  history?: string[];
  historyIndex?: number;
}

export interface SearchResult {
  name: string;
  path: string;
  tags?: string[];
}
