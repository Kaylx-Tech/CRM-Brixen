/** Class names for the Finstap sidebar rows (Layout/nav-main.jsx and the Settings row in Layout/Sidebar.jsx). */
// Finstap menu look (Shopify-style): every row the same size, 13px medium titles with 17px outline icons,
// the active page a raised 3D row (fs-raised in index.css), small sentence-case group headings, quiet count badges
export const FINSTAP_MENU = {
  group: "px-2 py-1",
  label: "h-7 px-2.5 text-xs font-medium text-sidebar-foreground/55",
  menu: "gap-px",
  button:
    "fs-menu-btn relative h-8 gap-2.5 rounded-[10px] px-2.5 text-[0.8125rem] font-medium text-sidebar-foreground/85 transition-colors duration-150 hover:bg-white/[0.07] hover:text-sidebar-foreground " +
    "data-active:text-sidebar-foreground " +
    "[&_svg]:size-[1.0625rem]! [&_svg]:stroke-[1.75] [&_svg]:text-sidebar-foreground/70 hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-sidebar-foreground",
  badge:
    "fs-menu-badge top-1.5! right-2 h-5 min-w-5 rounded-full bg-white/15 px-1.5 text-[0.6875rem] font-semibold text-sidebar-foreground!",
  // A tiny word raised just above the end of the title (`tag` in finstap-nav.js, e.g. "Soon"), like a
  // superscript: an accent gradient pill with a fine light edge and a shine that passes now and then
  tag:
    "fs-menu-tag -ml-1 shrink-0 self-start -translate-y-1 text-[0.625rem] leading-none font-medium lowercase text-sidebar-primary group-data-[collapsible=icon]:hidden",
}
