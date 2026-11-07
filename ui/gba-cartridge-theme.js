const { selectorAnimationXml } = require('./selector-animation');

module.exports = function gbaPictureTheme(base) {
  const escaped = base.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!-- READY PLAYER ONE GBA PICTURES -->
<theme>
  <formatVersion>7</formatVersion>
  <include>${escaped}</include>
  <customView name="RP1Pictures" inherits="grid" displayName="Pictures">
    <imagegrid name="gamegrid">
      <autoLayoutSelectedZoom>1.0</autoLayoutSelectedZoom>
      <autoLayout>4 2</autoLayout>
      <margin>0.001823 0.003241</margin>
      <imageSource>image</imageSource>
      <gameImage>/userdata/roms/gba/media/rp1-gba-blank.png</gameImage>
    </imagegrid>
    <gridtile name="default">
      <size>1 1</size>
      <padding>0 0</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>00000000</backgroundCenterColor><backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <gridtile name="selected">
      <size>1 1</size>
      <padding>0 0</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>00000000</backgroundCenterColor><backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <image name="gridtile.image">
      <maxSize>0.98 0.98</maxSize><color>FFFFFFFF</color><roundCorners>0</roundCorners><linearSmooth>true</linearSmooth><zIndex>30</zIndex>
    </image>
    <ninepatch name="gridtile.background:selected">
      <path>/userdata/roms/gba/media/rp1-gba-selector.png</path>
      <cornerSize>28 28</cornerSize><padding>-18 -18</padding>${selectorAnimationXml()}<zIndex>100</zIndex>
    </ninepatch>
  </customView>
</theme>
`;
};
