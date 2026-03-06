import type { DetectedType } from './document-intelligence.value-object';

export interface MetadataJson {
  title:       string;
  userTags:    string[];
  notes:       string | null;
  userOverrideType: DetectedType | null;
  lastEditedAt: string | null;
  [key: string]: unknown;
}

export class DocumentMetadata {
  constructor(
    public readonly title:       string,
    public readonly userTags:    ReadonlyArray<string>,
    public readonly notes:       string | null,
    public readonly userOverrideType: DetectedType | null,
    public readonly lastEditedAt: Date | null,
  ) {}

  withTitle(newTitle: string): DocumentMetadata {
    return new DocumentMetadata(newTitle, this.userTags, this.notes, this.userOverrideType, new Date());
  }

  withUserTags(tags: string[]): DocumentMetadata {
    return new DocumentMetadata(this.title, tags, this.notes, this.userOverrideType, new Date());
  }

  withNotes(notes: string | null): DocumentMetadata {
    return new DocumentMetadata(this.title, this.userTags, notes, this.userOverrideType, new Date());
  }

  toJSON(): MetadataJson {
    return {
      title:        this.title,
      userTags:     [...this.userTags],
      notes:        this.notes,
      userOverrideType: this.userOverrideType,
      lastEditedAt: this.lastEditedAt?.toISOString() ?? null,
    };
  }

  static default(title: string): DocumentMetadata {
    return new DocumentMetadata(title, [], null, null, null);
  }
}
