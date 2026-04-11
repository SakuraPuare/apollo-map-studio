import {
  MousePointer2,
  Hand,
  Pencil,
  Spline,
  Circle,
  Square,
  Hexagon,
  Undo2,
  Redo2,
  Trash2,
  Grid3X3,
  Magnet,
  Settings,
  Download,
  LayoutDashboard,
  Command,
  Search,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  MousePointer2,
  Hand,
  Pencil,
  Spline,
  Circle,
  Square,
  Hexagon,
  Undo2,
  Redo2,
  Trash2,
  Grid3X3,
  Magnet,
  Settings,
  Download,
  LayoutDashboard,
  Command,
};

export function getIcon(name?: string): React.ElementType {
  return (name && ICON_MAP[name]) || Search;
}
