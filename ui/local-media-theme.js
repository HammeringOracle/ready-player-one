module.exports = function localMediaTheme(base, system) {
  const escaped = base.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const folder = system === 'ps1' ? 'psx' : system;
  const label = system === 'n64' ? 'NINTENDO 64' : system === 'gamecube' ? 'GAMECUBE' : system === 'ps1' ? 'PLAYSTATION' : system === 'ps2' ? 'PLAYSTATION 2' : system === 'ps3' ? 'PLAYSTATION 3' : system === 'ps4' ? 'PLAYSTATION 4' : system === 'wiiu' ? 'WII U' : system === 'xbox' ? 'XBOX' : system === 'xbox360' ? 'XBOX 360' : system === 'movies' ? 'MOVIES' : 'WII';
  const isDisc = ['gamecube', 'wii', 'ps1', 'ps2', 'ps3', 'xbox', 'xbox360'].includes(system);
  const isMovies = system === 'movies';
  // Every optical-disc system uses the exact same visible disc dimensions.
  // This keeps Wii aligned with PSX/PS2/PS3 in the shared 5x2 layout.
  const imageSize = isDisc ? '1.10 1.10' : isMovies || system === 'wiiu' ? '1.08 1.08' : system === 'ps4' ? '0.98 0.98' : '0.95 0.95';
  const tilePadding = isDisc ? '-18 -18' : '0 0';
  // Wii's selector is a complete circular image. A zero corner size makes
  // Batocera scale it as one piece instead of nine-slicing and deforming it.
  const selectorCorners = isDisc ? '0 0' : ['ps4', 'wiiu', 'movies'].includes(system) ? '8 8' : '32 32';
  // The circular selector has a protected transparent edge so its glow cannot
  // be clipped by the grid tile. Expand its tile footprint to keep the ring
  // fully outside the unchanged disc artwork.
  const selectorPadding = isDisc ? '-40 -40' : '-18 -18';
  return `<!-- READY PLAYER ONE ${label} PICTURES -->
<theme>
  <formatVersion>7</formatVersion>
  <include>${escaped}</include>
  ${isMovies ? `<view name="system">
    <image name="ControllerOverlay" extra="true"><path>/userdata/roms/movies/media/images/movies.png</path><maxSize>0.20 0.33</maxSize><linearSmooth>true</linearSmooth><color>FFFFFFFF</color></image>
    <image name="logo"><path>/userdata/roms/movies/media/images/movies-logo.png</path><linearSmooth>true</linearSmooth></image>
  </view>` : ''}
  <customView name="RP1Pictures" inherits="grid" displayName="Pictures">
    <imagegrid name="gamegrid">
      <autoLayoutSelectedZoom>1.0</autoLayoutSelectedZoom>
      <autoLayout>${isMovies ? '6 2' : isDisc ? '5 2' : ['ps4', 'wiiu'].includes(system) ? '6 2' : '4 2'}</autoLayout>
      <margin>0.001823 0.003241</margin>
      <imageSource>image</imageSource>
      <gameImage>/userdata/roms/${folder}/media/rp1-${system}-blank.png</gameImage>
    </imagegrid>
    <gridtile name="default">
      <padding>${tilePadding}</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>00000000</backgroundCenterColor><backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <gridtile name="selected">
      <padding>${tilePadding}</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>00000000</backgroundCenterColor><backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <image name="gridtile.image">
      <maxSize>${imageSize}</maxSize><color>FFFFFFFF</color><roundCorners>0</roundCorners><linearSmooth>true</linearSmooth><zIndex>30</zIndex>
    </image>
    ${system === 'wiiu' ? `<text name="gridtile"><size>1 0.115</size><singleLineScroll>false</singleLineScroll><alignment>center</alignment></text>
    <text name="gridtile:selected"><size>1 0.115</size><singleLineScroll>false</singleLineScroll><alignment>center</alignment></text>` : ''}
    ${isMovies ? `<text name="gridtile"><fontPath>/usr/share/fonts/dejavu/DejaVuSansCondensed-Bold.ttf</fontPath><fontSize>0.034</fontSize><singleLineScroll>false</singleLineScroll><alignment>center</alignment><color>F5F7FAFF</color></text>
    <text name="gridtile:selected"><fontPath>/usr/share/fonts/dejavu/DejaVuSansCondensed-Bold.ttf</fontPath><fontSize>0.034</fontSize><singleLineScroll>false</singleLineScroll><alignment>center</alignment><color>FFFFFFFF</color></text>` : ''}
    <ninepatch name="gridtile.background:selected">
      <path>/userdata/roms/${folder}/media/rp1-${system}-selector.png</path>
      <cornerSize>${selectorCorners}</cornerSize><padding>${selectorPadding}</padding><color>4FA9FFFF</color>
      <animateColor>F2C94CFF</animateColor><animateColorTime>720</animateColorTime><zIndex>100</zIndex>
    </ninepatch>
  </customView>
</theme>
`;
};
