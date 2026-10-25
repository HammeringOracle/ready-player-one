// Mixed-system collections must preserve each game's own cover/disc aspect
// ratio.  A maxSize constraint fits the full image without cropping it.
module.exports = function collectionCoverTheme(_base, label) {
  const title = String(label || 'COLLECTION').toUpperCase();
  return `<!-- READY PLAYER ONE ${title} COVERS -->
<theme>
  <formatVersion>7</formatVersion>
  <customView name="RP1CollectionCovers" inherits="grid" displayName="Pictures">
    <imagegrid name="gamegrid">
      <autoLayoutSelectedZoom>1.0</autoLayoutSelectedZoom>
      <autoLayout>6 2</autoLayout>
      <margin>0.001823 0.003241</margin>
      <imageSource>image</imageSource>
    </imagegrid>
    <gridtile name="default">
      <padding>0 0</padding><selectionMode>image</selectionMode>
      <backgroundColor>00000000</backgroundColor><backgroundCenterColor>00000000</backgroundCenterColor><backgroundEdgeColor>00000000</backgroundEdgeColor>
    </gridtile>
    <gridtile name="selected">
      <padding>0 0</padding><selectionMode>image</selectionMode>
      <backgroundColor>4FA9FF55</backgroundColor><backgroundCenterColor>4FA9FF22</backgroundCenterColor><backgroundEdgeColor>FFFFFFFF</backgroundEdgeColor>
    </gridtile>
    <image name="gridtile.image">
      <maxSize>0.92 0.92</maxSize><color>FFFFFFFF</color><roundCorners>0</roundCorners><linearSmooth>true</linearSmooth><zIndex>30</zIndex>
    </image>
  </customView>
</theme>
`;
};
