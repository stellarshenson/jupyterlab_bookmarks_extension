import { DocumentRegistry } from '@jupyterlab/docregistry';
import { fileIcon, LabIcon } from '@jupyterlab/ui-components';

/** The icon of the file's type; the registry falls back to the text type, and that to the file icon. */
export function fileTypeIcon(
  registry: DocumentRegistry,
  path: string
): LabIcon {
  return registry.getFileTypeForModel({ path }).icon ?? fileIcon;
}
