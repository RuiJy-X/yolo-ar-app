import torch
import torch.nn as nn
from torch import einsum
from einops import rearrange

class GCN(nn.Module):
    def __init__(self, in_channels, out_channels, A):
        super(GCN, self).__init__()
        self.register_buffer('A', A)
        self.conv = nn.Conv1d(in_channels, out_channels, 1)

    def forward(self, x):
        A = self.A
        if A.dim() == 3:
            A = A.mean(0)
        x = einsum('vu, ncu -> ncv', A.to(x.dtype), x)
        x = self.conv(x)
        return x

class SA_GC(nn.Module):
    def __init__(self, in_channels, out_channels, A, n_heads=8):
        super(SA_GC, self).__init__()
        
        # --- HEAD MATCHING LOGIC ---
        # If the graph A has a specific number of heads (e.g. 3), 
        # we must use that same number for the attention mechanism.
        if A.dim() == 3:
            self.n_heads = A.shape[0]
        else:
            self.n_heads = n_heads

        self.inner_dim = out_channels // self.n_heads
        self.all_head_dim = self.inner_dim * self.n_heads
        
        self.to_qk = nn.Linear(in_channels, self.all_head_dim * 2)
        self.to_v = nn.Linear(in_channels, self.all_head_dim)
        self.proj = nn.Linear(self.all_head_dim, out_channels)
        self.scale = self.inner_dim ** -0.5
        
        if isinstance(A, torch.Tensor):
            self.register_buffer('A_base', A)
        else:
            self.register_buffer('A_base', torch.tensor(A, dtype=torch.float32))

    def forward(self, x):
        B, C, V = x.shape
        y = rearrange(x, 'b c v -> b v c')
        
        qk = self.to_qk(y).chunk(2, dim=-1)
        q, k = map(lambda t: rearrange(t, 'b v (h d) -> b h v d', h=self.n_heads), qk)
        
        dots = einsum('b h i d, b h j d -> b h i j', q, k) * self.scale
        attn = dots.softmax(dim=-1)
        
        # Broadcasting the Graph
        A = self.A_base
        if A.dim() == 2:
            A = A.unsqueeze(0).unsqueeze(0) # (1, 1, V, V)
        elif A.dim() == 3:
            A = A.unsqueeze(0) # (1, H, V, V)
            
        # This addition will now succeed because self.n_heads matches A.shape[0]
        combined_A = attn + A
        
        v = rearrange(self.to_v(y), 'b v (h d) -> b h v d', h=self.n_heads)
        out = einsum('b h i j, b h j d -> b h i d', combined_A, v)
        
        out = rearrange(out, 'b h v d -> b v (h d)')
        out = self.proj(out)
        
        return rearrange(out, 'b v c -> b c v')