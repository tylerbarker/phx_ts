/*
================================================================================
Phoenix LiveView JavaScript Client
================================================================================

See the hexdocs at `https://hexdocs.pm/phoenix_live_view` for documentation.

*/

import DOM from "./dom"
import LiveSocket, {isUsedInput} from "./live_socket"
import View from "./view"
import ViewHook from "./view_hook"

/** Creates a ViewHook instance for the given element and callbacks.
 *
 * @param {HTMLElement} el - The element to associate with the hook.
 * @param {Object} [callbacks] - The list of hook callbacks, such as mounted,
 *   updated, destroyed, etc.
 *
 * @example
 *
 * class MyComponent extends HTMLElement {
 *   connectedCallback(){
 *     let onLiveViewMounted = () => this.hook.pushEvent(...))
 *     this.hook = createHook(this, {mounted: onLiveViewMounted})
 *   }
 * }
 *
 * *Note*: `createHook` must be called from the `connectedCallback` lifecycle
 * which is triggered after the element has been added to the DOM. If you try
 * to call `createHook` from the constructor, an error will be logged.
 *
 * Returns the ViewHook instance for the custom element.
 */
const createHook = (el: HTMLElement, callbacks: Record<string, unknown> = {}) => {
  const existingHook = DOM.getCustomElHook(el)
  if(existingHook){ return existingHook }

  const hook = new ViewHook(View.closestView(el), el, callbacks)
  DOM.putCustomElHook(el, hook)
  return hook
}

export {
  LiveSocket,
  isUsedInput,
  createHook
}
