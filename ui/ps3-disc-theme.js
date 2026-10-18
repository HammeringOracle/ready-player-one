// PS3 disc artwork stays transparent and is not wrapped in a grid tile or selector.
module.exports = function ps3DiscTheme(base) {
  const escaped = base.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!-- READY PLAYER ONE PS3 DISC -->
<theme>
  <formatVersion>7</formatVersion>
  <include>${escaped}</include>
  <customView name="RP1Disc" inherits="grid" displayName="Discs">
    <imagegrid name="gamegrid">
      <autoLayoutSelectedZoom>1</autoLayoutSelectedZoom>
      <imageSource>image</imageSource>
      <itemTemplate>
        <container name="rp1-ps3-disc-tile">
          <pos>0 0</pos>
          <size>1 1</size>
          <image name="rp1-ps3-disc">
            <path>{game:image}</path>
            <origin>0.5 0.5</origin>
            <pos>0.5 0.43</pos>
            <maxSize>0.86 0.86</maxSize>
            <color>FFFFFFFF</color>
            <roundCorners>0</roundCorners>
            <linearSmooth>true</linearSmooth>
          </image>
          <text name="rp1-ps3-title">
            <text>{grid:label}</text>
            <pos>0.05 0.88</pos>
            <size>0.9 0.1</size>
            <fontSize>0.024</fontSize>
            <alignment>center</alignment>
            <color>FFFFFFFF</color>
            <backgroundColor>00000000</backgroundColor>
          </text>
        </container>
      </itemTemplate>
    </imagegrid>
  </customView>
</theme>
`;
};
