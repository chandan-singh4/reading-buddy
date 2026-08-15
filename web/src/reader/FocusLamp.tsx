/**
 * The reading lamp: Focus Mode's control, in two states.
 *
 * Off, it is line art — an unlit lamp over a page, drawn in `currentColor` so
 * it takes the bar's own text shade and every theme gets it right for free.
 * On, the shade fills, a cone of light falls out of it onto the page, and the
 * bulb glows. The lamp is the same drawing in both states; only what is *lit*
 * changes, which is the whole idea being illustrated.
 *
 * One SVG rather than two, with the lit parts fading in. Swapping between two
 * separate icons makes the lamp itself jump by a pixel or two as the paths
 * change; keeping one skeleton and animating the fill means the object stays
 * put and only the light arrives. The fades are in `Chrome.module.css`, beside
 * the halo, so all of the light in this control is described in one place.
 */

export interface FocusLampProps {
  /** Whether Focus Mode is on. */
  on: boolean
}

export function FocusLamp({ on }: FocusLampProps) {
  return (
    <svg
      className="focusLamp"
      data-on={on}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* The throw of light, under everything else so the lamp's own lines stay
          crisp on top of it. Only ever visible when the lamp is on. */}
      <path className="lampThrow" d="M11.1 8.6 5.6 19.2h11L11.1 8.6Z" stroke="none" />

      {/* The stand: foot, upright, elbow. */}
      <path d="M3.2 19.2h4.4" />
      <path d="M5.4 19.2v-8.1" />
      <path d="M5.4 11.1 8.3 6.9" />

      {/* The shade, and the bulb inside it. */}
      <path className="lampShade" d="M8.3 6.9h5.6l1.6 3.4H9.9L8.3 6.9Z" />
      <circle className="lampBulb" cx="12.1" cy="10.9" r="1" stroke="none" />

      {/* The page it is lit for. The lamp is only a lamp; the page is what
          makes it a *reading* lamp, and it is the thing the light lands on. */}
      <path d="M5.6 19.2h11" />
      <path className="lampPage" d="M9.3 15.4h4.4v3.8H9.3v-3.8Z" />
    </svg>
  )
}
