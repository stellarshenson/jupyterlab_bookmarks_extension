import { LabIcon } from '@jupyterlab/ui-components';

/** The panel's own icon, also named by the schema's `jupyter.lab.setting-icon`. */
export const bookmarksIcon = new LabIcon({
  name: 'jupyterlab_bookmarks_manager_extension:bookmarks',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 24 24"><path class="jp-icon3" fill="#616161" d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1z"/></svg>'
});

/** Clear a section: an eraser, the two stroked paths of the workspace manager's. */
export const eraserIcon = new LabIcon({
  name: 'jupyterlab_bookmarks_manager_extension:eraser',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 24 24">' +
    '<path class="jp-icon3" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="fill:none" d="M14.5 4.5 19.5 9.5 9.5 19.5 4.5 14.5z"/>' +
    '<path class="jp-icon3" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="fill:none" d="M11.5 7.5 16.5 12.5"/>' +
    '</svg>'
});
