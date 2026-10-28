import { LabIcon } from '@jupyterlab/ui-components';

/** The panel's own icon, also named by the schema's `jupyter.lab.setting-icon`. */
export const bookmarksIcon = new LabIcon({
  name: 'jupyterlab_bookmarks_extension:bookmarks',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 24 24"><path class="jp-icon3" fill="#616161" d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1z"/></svg>'
});
