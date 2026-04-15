export type ArtifactType = "code" | "document" | "action_items";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
}
