import { describe, expect, test } from "bun:test";

import { Socket } from "phoenix_ts";
import { LiveSocket } from "../assets/js/phoenix_live_view";
import { closestPhxBinding } from "../src/utils";

import {liveViewDOM, simulateJoinedView } from "./test_helpers"

let setupView = (content) => {
  let el = liveViewDOM(content)
  globalThis.document.body.appendChild(el)
  let liveSocket = new LiveSocket("/live", Socket)
  return simulateJoinedView(el, liveSocket)
}

describe("utils", () => {
  describe("closestPhxBinding", () => {
    test("if an element's parent has a phx-click binding and is not disabled, return the parent", () => {
      let _view = setupView(`
      <button id="button" phx-click="toggle">
        <span id="innerContent">This is a button</span>
      </button>
      `)
      let element = globalThis.document.querySelector("#innerContent")
      let parent = globalThis.document.querySelector("#button")
      expect(closestPhxBinding(element, "phx-click")).toBe(parent)
    })

    test("if an element's parent is disabled, return null", () => {
      let _view = setupView(`
      <button id="button" phx-click="toggle" disabled>
        <span id="innerContent">This is a button</span>
      </button>
      `)
      let element = globalThis.document.querySelector("#innerContent")
      expect(closestPhxBinding(element, "phx-click")).toBe(null)
    })
  })
})
