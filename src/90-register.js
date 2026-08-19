pcDefine("climate-panel-card", ClimatePanelCard);
pcDefine("sleep-panel-card", SleepPanelCard);
pcDefine("purdy-header-card", PurdyHeaderCard);
pcDefine("purdy-attention-card", PurdyAttentionCard);
pcDefine("purdy-people-card", PurdyPeopleCard);
pcDefine("purdy-rooms-card", PurdyRoomsCard);
pcDefine("purdy-quick-card", PurdyQuickCard);
pcDefine("purdy-notifications-card", PurdyNotificationsCard);
pcDefine("purdy-remote-card", PurdyRemoteCard);
pcDefine("purdy-devices-card", PurdyDevicesCard);
pcDefine("purdy-music-card", PurdyMusicCard);
pcDefine("purdy-shell-card", PurdyShellCard);
pcDefine("purdy-desk-card", PurdyDeskCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "climate-panel-card",
    name: "Climate Panel Card",
    description: "Cohesive climate panel: weather, temp ring with hold steppers, trend graph, zones, status chips, and room rows. Set compact: true for the home-screen summary.",
    preview: false,
    documentationURL: "https://github.com/mbwp1234/purdy-cards",
  },
  {
    type: "sleep-panel-card",
    name: "Sleep Panel Card",
    description: "Cohesive infant sleep panel: composition ring with 7-day goal, vitals with baseline deltas, hypnogram, and recap rows. Set ribbon: true for the home-screen summary.",
    preview: false,
    documentationURL: "https://github.com/mbwp1234/purdy-cards",
  },
  { type: "purdy-header-card", name: "Purdy Header Card", description: "Greeting, date, weather and occupancy.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-attention-card", name: "Purdy Attention Card", description: "Rule-driven fault list. Renders nothing when the house is clean.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-people-card", name: "Purdy People Card", description: "Presence with battery and step counts, side by side.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-rooms-card", name: "Purdy Rooms Card", description: "Scrolling strip of room temperatures and humidity.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-quick-card", name: "Purdy Quick Card", description: "Grid of state-coloured action tiles.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-notifications-card", name: "Purdy Notifications Card", description: "Notification centre backed by a todo list; keeps dismissed items readable.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-remote-card", name: "Purdy Remote Card", description: "Android TV remote with a device selector, brand app grid and circular d-pad.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-devices-card", name: "Purdy Devices Card", description: "Collapsible device groups with summary lines; faults stay visible while collapsed.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-music-card", name: "Purdy Music Card", description: "Music Assistant now-playing with transport, room switching and playlist presets. Set compact: true for the self-hiding home-screen headline.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-shell-card", name: "Purdy Shell Card", description: "The whole phone view as one element: gradient ground, one glass column of expanding sections, and a fixed dock with a now-playing bar.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-desk-card", name: "Purdy Desk Card", description: "The whole desktop view as one element: one glass sheet on one gradient, a status strip, a stage of panels that expand sideways, and a dock. Same section config as the shell.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" }
);

console.info(
  `%c PURDY-CARDS %c v${PC_VERSION} %c climate v${CPC_VERSION} · sleep v${SPC_VERSION} `,
  "background:#56D4E4;color:#0f1317;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;",
  "background:#232d38;color:#e6ecf2;padding:2px 6px;",
  "background:#151b22;color:#8b96a3;border-radius:0 4px 4px 0;padding:2px 6px;"
);
