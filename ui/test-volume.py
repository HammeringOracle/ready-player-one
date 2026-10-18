import importlib.util, sys, types, unittest, tempfile
from pathlib import Path
from unittest.mock import patch
if sys.platform == 'win32':
    sys.modules['fcntl']=types.SimpleNamespace(LOCK_EX=2,flock=lambda *args:None)
spec=importlib.util.spec_from_file_location('volume',Path(__file__).with_name('volume.py'))
volume=importlib.util.module_from_spec(spec);spec.loader.exec_module(volume)

def stream(binary,name='',pid='1',index=1):
    return {'index':index,'mute':False,'volume':{'left':{'value':65536}},'properties':{'application.process.binary':binary,'application.name':name,'application.process.id':pid,'object.serial':str(index)}}

class VolumeTests(unittest.TestCase):
    def test_classification(self):
        no=lambda _:False
        self.assertEqual(volume.group_of(stream('mpv','RecRoomMusic'),'cemu',no),'music')
        self.assertEqual(volume.group_of(stream('emulationstation'),'cemu',no),'music')
        self.assertEqual(volume.group_of(stream('cemu'),'cemu',no),'game')
        self.assertEqual(volume.group_of(stream('retroarch'),'libretro',no),'game')
        self.assertIsNone(volume.group_of(stream('chrome'),'cemu',no))
        self.assertIsNone(volume.group_of(stream('mpv','Other player'),'cemu',no))
        self.assertIsNone(volume.group_of(stream('cemu'),'',no))
        self.assertEqual(volume.group_of(stream('unknown-emulator'), 'unknown',lambda _:True),'game')

    def test_only_target_stream_and_no_master_volume(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(volume,'BASE',Path(directory)),patch.object(volume,'call') as call:
            items=[stream('mpv','RecRoomMusic',index=1),stream('cemu',index=2),stream('chrome',index=3)]
            volume.apply_levels(items,{'music':{'volume':40,'mute':True}},'cemu')
            self.assertEqual([c.args[0] for c in call.call_args_list],[['pactl','set-sink-input-volume','1','40%'],['pactl','set-sink-input-mute','1','1']])
            self.assertEqual(volume.read(Path(directory)/'originals.json',{})['1']['volume'],[65536])
            call.reset_mock()
            volume.apply_levels(items,{},'cemu')
            call.assert_not_called()

    def test_feature_required(self):
        with patch.object(volume,'installed',return_value=False),patch.object(volume,'call') as call:
            with self.assertRaisesRegex(RuntimeError,'Install Music over Games'):volume.control('game_up')
            call.assert_not_called()

    def test_install_rollback_preserves_previous_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory)/'volume';base.mkdir()
            config=base/'config.json';config.write_text('{"enabled":false}')
            helper=base/'volume.py';helper.write_text('previous helper')
            service=Path(directory)/'services'/'recroom_volume'
            original_path=Path
            def path(value):
                if value=='/etc/os-release':return types.SimpleNamespace(read_text=lambda:'NAME=Batocera.linux')
                return original_path(value)
            with patch.object(volume,'BASE',base),patch.object(volume,'CONFIG',config),patch.object(volume,'SERVICE',service),patch.object(volume,'Path',side_effect=path),patch.object(volume.shutil,'which',return_value='/usr/bin/tool'),patch.object(volume,'streams',return_value=[]),patch.object(volume,'service_pid',return_value=None),patch.object(volume,'stop'),patch.object(volume,'start',side_effect=RuntimeError('start failed')),patch.object(volume,'call') as call,patch.object(volume.subprocess,'run',return_value=types.SimpleNamespace(returncode=1,stdout='',stderr='')):
                with self.assertRaisesRegex(RuntimeError,'start failed'):
                    volume.setup({'action':'volume-install','source':'new helper','playDuringGames':False})
                self.assertEqual(helper.read_text(),'previous helper')
                self.assertEqual(config.read_text(),'{"enabled":false}')
                self.assertFalse(service.exists())
                call.assert_called_with(['batocera-services','disable','recroom_volume'])

    def test_levels_clamp_and_remember_without_stream(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(volume,'BASE',Path(directory)),patch.object(volume,'STATE',Path(directory)/'levels.json'),patch.object(volume,'installed',return_value=True),patch.object(volume,'streams',return_value=[]):
            volume.control('game_up')
            volume.control('game_down')
            volume.control('music_mute')
            self.assertEqual(volume.read(volume.STATE,{}),{'game':{'volume':95},'music':{'mute':True}})

if __name__=='__main__':unittest.main()
