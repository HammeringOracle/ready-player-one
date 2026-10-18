// SNES uses the same picture-only tile behavior as NES.
module.exports = function snesPictureTheme(base) {
  const escaped = base.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!-- READY PLAYER ONE SNES PICTURES -->
<theme>
  <formatVersion>7</formatVersion>
  <include>${escaped}</include>
  <customView name="RP1Pictures" inherits="grid" displayName="Pictures">
    <imagegrid name="gamegrid">
      <autoLayoutSelectedZoom>1.0</autoLayoutSelectedZoom>
      <autoLayout>4 2</autoLayout>
      <margin>0.001823 0.003241</margin>
      <imageSource>image</imageSource>
      <gameImage>/userdata/roms/snes/media/rp1-snes-blank.png</gameImage>
    </imagegrid>
    <gridtile name="default">
      <padding>0 0</padding>
      <selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor>
      <backgroundCenterColor>00000000</backgroundCenterColor>
      <backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <gridtile name="selected">
      <padding>0 0</padding>
      <selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor>
      <backgroundCenterColor>00000000</backgroundCenterColor>
      <backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <image name="gridtile.image">
      <maxSize>0.95 0.95</maxSize><color>FFFFFFFF</color><roundCorners>0</roundCorners><linearSmooth>true</linearSmooth><zIndex>30</zIndex>
    </image>
    <ninepatch name="gridtile.background:selected">
      <path>/userdata/roms/snes/media/rp1-snes-selector.png</path>
      <cornerSize>32 32</cornerSize><padding>-18 -18</padding><color>4FA9FFFF</color>
      <animateColor>F2C94CFF</animateColor><animateColorTime>720</animateColorTime><zIndex>100</zIndex>
    </ninepatch>
  </customView>
</theme>
`;
};
