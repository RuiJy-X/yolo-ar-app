# hook-torch.py
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

datas = collect_data_files('torch')
binaries = collect_dynamic_libs('torch')

# Exclude the broken compiler/dynamo stack entirely
excludedimports = [
    'torch._dynamo',
    'torch._numpy',
    'torch._inductor',
    'torch._functorch',
    'torch.distributed',
    'torch.fx',
]