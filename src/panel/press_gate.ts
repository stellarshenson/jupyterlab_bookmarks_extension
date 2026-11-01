/** What ends a press: the release, its cancel, or a move with no button that shows a release went unreported. */
const PRESS_ENDS = ['pointerup', 'pointercancel', 'pointermove'];

/** What follows a release: its click, or for another button its auxclick; `PRESS_ENDS` still listens for the rest. */
const RELEASE_ENDS = ['click', 'auxclick'];

/**
 * Holds a render while a pointer is pressed, because a row replaced under a pressed pointer loses its click and
 * a tab drag's drop mark. A render held back runs after the click of the release, on the document in the bubble
 * phase, so the row's own handler has run. A click stopped on its way, or a release with no click, leaves the
 * next move to run it. A new press leaves it due, and the end of that press runs it.
 */
export class PressGate implements EventListenerObject {
  /**
   * @param _render Runs the render held back
   */
  constructor(private _render: () => void) {
    document.addEventListener('pointerdown', this, true);
  }

  /**
   * Asks whether a render has to wait; when it does, the gate runs it later.
   *
   * @returns True while a press is held or a render held back waits for the event after the release
   */
  holds(): boolean {
    this._due ||= this._pressed;
    return this._due;
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'pointerdown':
        this._pressed = true;
        this._down = event;
        this._listen(PRESS_ENDS, true);
        return;
      case 'pointerup':
        this._pressed = false;
        // A press its handler prevented, as Lumino's tab drag does, ends with no click to wait for.
        if (this._due && !this._down?.defaultPrevented) {
          this._listen(RELEASE_ENDS, false);
          return;
        }
        break;
      case 'pointermove':
        // Lumino's tab drag sends a move of its own with no button when it starts, so only the browser's move counts.
        if (
          this._pressed &&
          ((event as PointerEvent).buttons !== 0 || !event.isTrusted)
        ) {
          return;
        }
        break;
    }
    this._settle();
  }

  /** The press and the wait are over: stops listening and runs the render held back. */
  private _settle(): void {
    this._pressed = false;
    for (const type of PRESS_ENDS) {
      document.removeEventListener(type, this, true);
    }
    for (const type of RELEASE_ENDS) {
      document.removeEventListener(type, this, false);
    }
    if (this._due) {
      this._due = false;
      this._render();
    }
  }

  private _listen(types: string[], capture: boolean): void {
    for (const type of types) {
      document.addEventListener(type, this, capture);
    }
  }

  private _pressed = false;
  private _down: Event | undefined;
  private _due = false;
}
