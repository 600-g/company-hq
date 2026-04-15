export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DragState {
  isDragging: boolean;
  source: "palette" | "canvas" | null;
  position: { x: number; y: number } | null;
}
