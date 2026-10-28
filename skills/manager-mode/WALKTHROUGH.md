# Walking Echo through pages

When Echo checks pages one at a time in their browser:

- **One window.** Work in tabs of Echo's existing window, opened with
  `Target.createTarget` and `background: true`. A new window steals Echo's
  focus, so open one only when Echo asks (for example, two versions side by
  side).
- **Scroll to the change,** and give Echo the page number and what differs in a
  line or two.
- **Prepare the next page** in a background tab while Echo looks, then swap on
  "next".
- **Keep a tab open.** Closing a window's last tab closes the window, and the
  last window quits the browser.
