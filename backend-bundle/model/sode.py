import numpy as np
import torch
import torch.nn.functional as F
from torch import nn
from einops import rearrange
from torchdiffeq import odeint as odeint

from model.modules import SA_GC
from model.encoder_decoder import Encoder_z0_RNN

class DiffeqSolver(nn.Module):
    # Numerical stability tolerances kept at 1e-3/1e-4
    def __init__(self, ode_func, method, odeint_rtol=1e-3, odeint_atol=1e-4):
        super(DiffeqSolver, self).__init__()
        self.ode_method = method
        self.ode_func = ode_func
        self.odeint_rtol = odeint_rtol
        self.odeint_atol = odeint_atol

    def forward(self, first_point, time_steps_to_predict):
        pred_y = odeint(self.ode_func, first_point, time_steps_to_predict.float(),
                        rtol=self.odeint_rtol, atol=self.odeint_atol,
                        method=self.ode_method)
        return pred_y

class SODE(nn.Module):
    def __init__(self, num_class, num_point, num_person, graph, in_channels=3, 
                 num_head=8, base_channel=64, T=32, dilation=1,
                 dual_branch=True, static_branch_weight=0.35, **kwargs):
        super(SODE, self).__init__()
        self.num_person = num_person
        self.dual_branch = dual_branch
        self.static_branch_weight = float(static_branch_weight)

        self.spatial_encoder = nn.Sequential(
            SA_GC(in_channels, base_channel, graph, num_head),
            SA_GC(base_channel, base_channel, graph, num_head)
        )

        self.z0_encoder = Encoder_z0_RNN(base_channel, graph, T, dilation=dilation) 
        
        self.norm = nn.LayerNorm(base_channel)
        
        # This head will be re-initialized if num_class changes for UAV-Human
        self.cls_head = nn.Sequential(
            nn.Linear(base_channel, base_channel),
            nn.BatchNorm1d(base_channel),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(base_channel, num_class) # This is cls_head.4
        )

        # Static posture branch: summarizes mean/variance pose cues to reduce
        # confusion in static classes (sitting vs standing).
        self.static_encoder = nn.Sequential(
            nn.Linear(4 * num_point, base_channel),
            nn.BatchNorm1d(base_channel),
            nn.ReLU(),
            nn.Dropout(0.3),
        )
        self.static_head = nn.Sequential(
            nn.Linear(base_channel, base_channel),
            nn.BatchNorm1d(base_channel),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(base_channel, num_class)
        )

    def forward(self, x):
        N, C, T, V, M = x.shape
        x_flattened = rearrange(x, 'n c t v m -> (n m t) c v')
        z = self.spatial_encoder(x_flattened)
        z = rearrange(z, '(n m t) c v -> (n m) c t v', m=M, t=T)
        
        # Temporal RNN Encoder
        z0 = self.z0_encoder(z) # (N*M, C, V)
        
        # Global Spatial Pooling (Mean over joints)
        z_pooled = torch.mean(z0, dim=-1) # (N*M, C)
        
        # Final classification
        z_pooled = self.norm(z_pooled)
        dynamic_logits = self.cls_head(z_pooled)
        dynamic_logits = dynamic_logits.view(N, M, -1).mean(dim=1)

        if not self.dual_branch:
            return dynamic_logits, None, None, None, None

        xy = x[:, 0:2, :, :, :]
        pose_mean = xy.mean(dim=(2, 4))
        pose_var = xy.var(dim=(2, 4), unbiased=False)
        static_feat = torch.cat([pose_mean, pose_var], dim=1).reshape(N, -1)
        static_emb = self.static_encoder(static_feat)
        static_logits = self.static_head(static_emb)

        w = min(max(self.static_branch_weight, 0.0), 1.0)
        out = (1.0 - w) * dynamic_logits + w * static_logits
        
        return out, None, None, None, None