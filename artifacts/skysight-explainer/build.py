from pathlib import Path
import base64
import runpy

here = Path(__file__).resolve().parent
runpy.run_path(str(here / 'build-actual-ui.py'), run_name='__main__')

skill = Path(r'C:\Users\User\.agents\skills\explainer-default\SKILL.md').read_text(encoding='utf-8')
renderer = skill.split('```js\n// render.mjs:', 1)[1].split('\n```', 1)[0]
renderer = '// render.mjs:' + renderer
renderer = renderer.replace("args: ['--allow-file-access-from-files'],", "args: ['--allow-file-access-from-files'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),")
renderer = renderer.replace("await page.waitForFunction(() => window.VIDEO && typeof window.seek === 'function');", "await page.waitForFunction(() => window.VIDEO && typeof window.seek === 'function');\n  await page.evaluate(() => window.ready);")
renderer = renderer.replace("path.resolve(s)}'", "path.resolve(s).replaceAll('\\\\', '/')}'")
renderer = renderer.replace("'-preset', 'medium', seg", "'-preset', 'fast', '-threads', '2', seg")
renderer = renderer.replace("'-shortest', out", "'-shortest', '-movflags', '+faststart', out")
renderer = renderer.replace("'-c:a', 'aac'", "'-ar', '48000', '-c:a', 'aac'")
(here / 'render.mjs').write_text(renderer, encoding='utf-8')
print('Prepared skill renderer with asset readiness and Windows concat paths.')
