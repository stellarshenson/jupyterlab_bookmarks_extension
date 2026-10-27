import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { requestAPI } from './request';

/**
 * Initialization data for the jupyterlab_bookmarks_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_bookmarks_extension:plugin',
  description: 'Bookmarks side panel for web pages, files and terminal sessions, in folders, with tab menu actions',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension jupyterlab_bookmarks_extension is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('jupyterlab_bookmarks_extension settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for jupyterlab_bookmarks_extension.', reason);
        });
    }

    requestAPI<any>('hello', app.serviceManager.serverSettings)
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyterlab_bookmarks_extension server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
