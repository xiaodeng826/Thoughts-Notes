---
title: "ret2csu利用技巧"
date: 2026-10-17
draft: false
description: "处理gadget中用于pop参数的指令段不全的情况"
tags: ["PWN", "CTF", "二进制安全"]
lastmod: 2026-10-17
---

## 漏洞来源
### __libc_csu_init是传统 Linux ELF 程序启动过程中一个初始化函数，也就是说这段gadget是在程序内部的（不用查libc基址和版本）。由于这个函数特性，我们可以利用它实现任意的参数注入（实际上也就控制rdi,rsi,rdx这三个寄存器）。

## 使用方法与前提
###
