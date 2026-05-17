import torch
import torch.nn as nn
from model.modules import SA_GC, GCN

class SAGC_LSTM_Cell(nn.Module):
    def __init__(self, input_dim, hidden_dim, A):
        super(SAGC_LSTM_Cell, self).__init__()
        self.hidden_dim = hidden_dim
        self.sagc = SA_GC(input_dim + hidden_dim, 4 * hidden_dim, A)

    def forward(self, x, hidden):
        h_cur, c_cur = hidden
        combined = torch.cat([x, h_cur], dim=1)
        combined_conv = self.sagc(combined)
        
        cc_i, cc_f, cc_o, cc_g = torch.split(combined_conv, self.hidden_dim, dim=1)
        i, f, o, g = torch.sigmoid(cc_i), torch.sigmoid(cc_f), torch.sigmoid(cc_o), torch.tanh(cc_g)
        
        c_next = f * c_cur + i * g
        h_next = o * torch.tanh(c_next)
        return h_next, c_next

class Encoder_z0_RNN(nn.Module):
    def __init__(self, latent_dim, A, T, dilation=1):
        super(Encoder_z0_RNN, self).__init__()
        self.T = T
        self.dilation = dilation 
        self.cell = SAGC_LSTM_Cell(latent_dim, latent_dim, A)

    def forward(self, data):
        batch_size, channels, T, nodes = data.shape
        h = torch.zeros(batch_size, channels, nodes).to(data.device)
        c = torch.zeros(batch_size, channels, nodes).to(data.device)
        
        # FIX: Use range with a step size equal to dilation
        # This skips frames (e.g., if dilation=2, it takes 0, 2, 4, 6...)
        for t in range(0, T, self.dilation):
            h, c = self.cell(data[:, :, t, :], (h, c))
            # Stability Fix: Prevent NaN propagation
            h = torch.nan_to_num(h)
            c = torch.nan_to_num(c)
            
        return h