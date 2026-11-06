const SELECTOR_YELLOW = 'F2C94CFF';
const SELECTOR_BLUE = '4FA9FFFF';

function selectorAnimationXml() {
  return `<color>${SELECTOR_YELLOW}</color>
      <animateColor>${SELECTOR_BLUE}</animateColor><animateColorTime>720</animateColorTime>
      <scaleOrigin>0.5 0.5</scaleOrigin>
      <storyboard repeat="forever">
        <animation property="scale" from="0.965" to="1.0" duration="720" autoReverse="true" mode="EaseInOut"/>
      </storyboard>`;
}

module.exports = { SELECTOR_YELLOW, SELECTOR_BLUE, selectorAnimationXml };
