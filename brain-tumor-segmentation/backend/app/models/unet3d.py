"""The exact 3D U-Net architecture used in training (kaggle_2_train_eval.py)."""
import torch
import torch.nn as nn


class ConvBlock(nn.Module):
    def __init__(self, i, o):
        super().__init__()
        self.b = nn.Sequential(
            nn.Conv3d(i, o, 3, padding=1, bias=False), nn.InstanceNorm3d(o, affine=True), nn.LeakyReLU(0.01, True),
            nn.Conv3d(o, o, 3, padding=1, bias=False), nn.InstanceNorm3d(o, affine=True), nn.LeakyReLU(0.01, True))

    def forward(self, x):
        return self.b(x)


class UNet3D(nn.Module):
    def __init__(self, in_ch=4, out_ch=3, ch=(16, 32, 64, 128, 256)):
        super().__init__()
        self.channels = ch
        self.enc = nn.ModuleList()
        p = in_ch
        for c in ch:
            self.enc.append(ConvBlock(p, c))
            p = c
        self.pool = nn.MaxPool3d(2)
        self.up, self.dec = nn.ModuleList(), nn.ModuleList()
        for hi, lo in zip(ch[::-1][:-1], ch[::-1][1:]):
            self.up.append(nn.ConvTranspose3d(hi, lo, 2, stride=2))
            self.dec.append(ConvBlock(lo * 2, lo))
        self.out = nn.Conv3d(ch[0], out_ch, 1)

    def forward(self, x):
        skips = []
        for i, e in enumerate(self.enc):
            x = e(x) if i == 0 else e(self.pool(x))
            skips.append(x)
        x = skips.pop()
        for up, dec in zip(self.up, self.dec):
            x = dec(torch.cat([up(x), skips.pop()], 1))
        return self.out(x)
