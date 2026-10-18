import contextlib, io, json, runpy, sys, time, types, unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).parent
Matcher = runpy.run_path(str(HERE/'keypad-bridge.py'))['Matcher']


class KeypadTests(unittest.TestCase):
    def test_disappearing_input_does_not_stop_scan(self):
        open_input=runpy.run_path(str(HERE/'keypad-bridge.py'))['open_input']
        from unittest.mock import Mock
        device=object()
        api=types.SimpleNamespace(InputDevice=Mock(side_effect=[FileNotFoundError('removed input'),device]))
        self.assertIsNone(open_input(api,'/dev/input/event20'))
        self.assertIs(open_input(api,'/dev/input/event16'),device)

    def test_literal_escape(self):
        from unittest.mock import Mock
        send = runpy.run_path(str(HERE/'keypad-bridge.py'))['send_action']
        keyboard = Mock()
        with patch('subprocess.Popen') as launch:
            self.assertIsNone(send('escape', keyboard))
            launch.assert_not_called()
        self.assertEqual([c.args for c in keyboard.write.call_args_list], [(1,1,1),(1,1,0)])
        self.assertEqual(keyboard.syn.call_count, 2)

    def test_literal_f7(self):
        from unittest.mock import Mock
        send = runpy.run_path(str(HERE/'keypad-bridge.py'))['send_action']
        keyboard = Mock()
        with patch('subprocess.Popen') as launch:
            self.assertIsNone(send('f7', keyboard))
            launch.assert_not_called()
        self.assertEqual([c.args for c in keyboard.write.call_args_list], [(1,65,1),(1,65,0)])
        self.assertEqual(keyboard.syn.call_count, 2)

    def test_selected_keyboard_key(self):
        from unittest.mock import Mock
        send = runpy.run_path(str(HERE/'keypad-bridge.py'))['send_action']
        keyboard = Mock()
        fake_evdev = types.SimpleNamespace(ecodes=types.SimpleNamespace(KEY_F10=68))
        with patch.dict(sys.modules, {'evdev': fake_evdev}), patch('subprocess.Popen') as launch:
            self.assertIsNone(send('key:KEY_F10', keyboard))
            launch.assert_not_called()
        self.assertEqual([c.args for c in keyboard.write.call_args_list], [(1,68,1),(1,68,0)])
        self.assertEqual(keyboard.syn.call_count, 2)

    def test_unset_services_setting(self):
        import subprocess, textwrap
        source=(HERE/'keypad.py').read_text()
        block=textwrap.dedent(source[source.index('    services_result ='):source.index('    backups =')])
        for code,stdout,stderr,expected in [(1,'','',[]),(0,'existing_service\n','',['existing_service'])]:
            scope={'subprocess':types.SimpleNamespace(run=lambda *a,**k:subprocess.CompletedProcess([],code,stdout,stderr))}
            exec(block,scope)
            self.assertEqual(scope['enabled'],expected)
        with self.assertRaisesRegex(Exception,'Could not read'):
            exec(block,{'subprocess':types.SimpleNamespace(run=lambda *a,**k:subprocess.CompletedProcess([],1,'','read failed'))})

    def test_exact_shortcut_only(self):
        matcher = Matcher({(29,46):'exit'})
        results = [matcher.feed(c,v,0) for c,v in [(29,1),(46,1),(46,0),(29,0)]]
        self.assertEqual([a for a,e in results if a],['exit'])
        self.assertFalse(any(e for a,e in results))
        for events in [[(29,1),(47,1),(47,0),(29,0)],[(29,1),(29,0)],[(115,1),(115,0)]]:
            results = [matcher.feed(c,v,0) for c,v in events]
            self.assertFalse(any(a for a,e in results))
            self.assertEqual([event for a,e in results for event in e],events)

    def test_repeat_and_extra_modifier(self):
        matcher = Matcher({(29,46):'exit'})
        events = [(29,1),(46,1),(46,2),(46,2),(46,0),(29,0)]
        self.assertEqual(sum(bool(matcher.feed(c,v,0)[0]) for c,v in events),1)
        events = [(29,1),(42,1),(46,1),(46,0),(42,0),(29,0)]
        results = [matcher.feed(c,v,0) for c,v in events]
        self.assertFalse(any(a for a,e in results))
        self.assertEqual([event for a,e in results for event in e],events)

    def test_unmapped_hold_is_released(self):
        matcher = Matcher({(29,46):'exit'})
        matcher.feed(29,1,0)
        self.assertEqual(matcher.flush_held(3),[(29,1)])
        self.assertEqual(matcher.feed(29,0,4),(None,[(29,0)]))

    def test_capture_full_chord(self):
        class FakePath:
            def __init__(self,p): self.p=p
            def read_text(self): return 'NAME=Batocera.linux\nID=buildroot\n'
            def exists(self): return self.p=='/var/run/hotkeygen.pid'
        for codes in [[29,46],[29,47],[30],[8]]:
            class Device:
                info=types.SimpleNamespace(vendor=0x6d7f,product=0xdcfe)
                name='SDINNOVATION SIDE-KEYBOARD Keyboard'
                phys='usb-test'
                released=False
                consumed=False
                def capabilities(self): return {1:[29,46,47,30],2:[8]}
                def close(self): pass
                def grab(self): pass
                def ungrab(self): self.released=True
                def read(self):
                    if self.consumed: return []
                    self.consumed=True
                    if codes==[8]:return [types.SimpleNamespace(type=2,code=8,value=-1)]
                    return [types.SimpleNamespace(type=1,code=c,value=v) for c,v in [(c,1) for c in codes]+[(c,0) for c in reversed(codes)]]
            device=Device()
            evdev=types.SimpleNamespace(list_devices=lambda:['test'],InputDevice=lambda p:device,ecodes=types.SimpleNamespace(EV_KEY=1,bytype={1:{29:'KEY_LEFTCTRL',46:'KEY_C',47:'KEY_V',30:['KEY_A','KEY_ALIAS_A']}}))
            output=io.StringIO()
            def select(*args):
                time.sleep(.01)
                return ([device] if not device.consumed else [],[],[])
            with patch.dict(sys.modules,{'evdev':evdev}),patch('pathlib.Path',FakePath),patch('select.select',select),patch.object(sys,'argv',['keypad',json.dumps({'action':'learn'})]),contextlib.redirect_stdout(output):
                exec(compile((HERE/'keypad.py').read_text(),'keypad.py','exec'),{})
            self.assertEqual(json.loads(output.getvalue())['codes'],sorted(codes))
            if codes==[8]:
                self.assertEqual(json.loads(output.getvalue())['eventType'],'rel')
                self.assertEqual(json.loads(output.getvalue())['direction'],-1)
            self.assertTrue(device.released)


if __name__=='__main__': unittest.main()
