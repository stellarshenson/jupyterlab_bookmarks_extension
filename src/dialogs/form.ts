import { Dialog, DOMUtils } from '@jupyterlab/apputils';
import { TranslationBundle } from '@jupyterlab/translation';
import { Widget } from '@lumino/widgets';

/** A dialog body: a two-column table of labelled controls, then an optional status banner. */
export function formBody(
  rows: Array<[string, ...HTMLElement[]]>,
  banner?: HTMLElement
): Widget {
  const body = new Widget();
  body.addClass('jp-BookmarksPanel-dialogBody');
  const table = document.createElement('table');
  table.className = 'jp-BookmarksPanel-form';
  const tbody = table.createTBody();
  for (const [label, ...controls] of rows) {
    const row = tbody.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    const name = document.createElement('label');
    name.textContent = label;
    // The control stands in the next cell, so the label reaches it by id.
    name.htmlFor = controls[0].id = DOMUtils.createDomID();
    th.appendChild(name);
    const field = document.createElement('div');
    field.className = 'jp-BookmarksPanel-field';
    field.append(...controls);
    row.append(th);
    row.insertCell().appendChild(field);
  }
  body.node.appendChild(table);
  if (banner) {
    body.node.appendChild(banner);
  }
  return body;
}

export function textInput(value: string, required = false): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'jp-BookmarksPanel-input';
  input.value = value;
  // The dialog disables Save while a required field is empty.
  input.required = required;
  return input;
}

/**
 * Shows an edit dialog. The dialog checks its required fields only on an
 * `input` event, so the check runs once it is open: a New Bookmark dialog
 * starts with Save disabled.
 */
export async function showEditDialog(
  options: Partial<Dialog.IOptions<unknown>>
): Promise<Dialog.IResult<unknown>> {
  const dialog = new Dialog(options);
  const result = dialog.launch();
  await dialog.ready;
  dialog.node.dispatchEvent(new Event('input', { bubbles: true }));
  return result;
}

/** Cancel, then Save or `accept`: the only filled button, last, so Enter resolves it. */
export function editButtons(
  trans: TranslationBundle,
  accept = trans.__('Save')
): Dialog.IButton[] {
  return [
    Dialog.cancelButton({
      className: 'jp-BookmarksPanel-dialogButton jp-BookmarksPanel-secondary'
    }),
    Dialog.okButton({
      label: accept,
      className: 'jp-BookmarksPanel-dialogButton jp-BookmarksPanel-primary'
    })
  ];
}
