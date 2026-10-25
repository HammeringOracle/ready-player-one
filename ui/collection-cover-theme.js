// Mixed-system collections contain cartridges, discs and boxes at the same
// time. Keep the whole source image visible and let EmulationStation size the
// selected highlight from that image instead of forcing every console into a
// generic cover rectangle.
module.exports = function collectionCoverTheme(_base, label) {
  const title = String(label || 'COLLECTION').toUpperCase();
  return `<!-- READY PLAYER ONE ${title} COVERS -->
<theme>
  <formatVersion>7</formatVersion>
  <customView name="RP1CollectionCovers" inherits="grid" displayName="Pictures">
    <imagegrid name="gamegrid">
      <autoLayoutSelectedZoom>1.0</autoLayoutSelectedZoom>
      <autoLayout>5 2</autoLayout>
      <margin>0.001823 0.003241</margin>
      <imageSource>image</imageSource>
    </imagegrid>
    <gridtile name="default">
      <padding>-10 -10</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>00000000</backgroundCenterColor><backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <gridtile name="selected">
      <padding>-10 -10</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>4FA9FF20</backgroundCenterColor><backgroundEdgeColor>4FA9FFFF</backgroundEdgeColor>
    </gridtile>
    <image name="gridtile.image">
      <maxSize>0.88 0.88</maxSize><color>FFFFFFFF</color><roundCorners>0</roundCorners><linearSmooth>true</linearSmooth><zIndex>30</zIndex>
    </image>
  </customView>
</theme>
`;
};
