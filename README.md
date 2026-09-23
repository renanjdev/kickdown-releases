# KICKDOWN — instaladores

KICKDOWN é um ambiente multi-agente de desenvolvimento para Windows: uma grade de panes rodando CLIs de IA
(claude, codex, gemini) lado a lado, com missões, handoffs e um servidor MCP próprio para os agentes
delegarem trabalho entre si.

Este repositório guarda **só os instaladores e o manifesto de atualização** (`latest.json`). O código-fonte é privado.

## Instalar

1. Abra a [última release](https://github.com/renanjdev/kickdown-releases/releases/latest).
2. Baixe `KICKDOWN_<versão>_x64-setup.exe`.
3. Execute. A instalação é por usuário e não pede permissão de administrador.

Requisitos: Windows 10/11 x64 com WebView2 (já vem no Windows 11; o instalador baixa se faltar).

### Aviso do SmartScreen

A beta ainda não tem certificado de assinatura de código, então o Windows pode mostrar
**"O Windows protegeu o computador"**. Para seguir:

1. Clique em **Mais informações**.
2. Clique em **Executar assim mesmo**.

O instalador é o mesmo publicado aqui; confira o nome do arquivo e a release de onde baixou.

## Atualizações

O app verifica este repositório ao abrir e periodicamente. Quando sai uma versão nova, ela é baixada em
segundo plano e aparece um aviso discreto na barra: **"Atualização X.Y.Z disponível · Reiniciar para atualizar"**.
Nada é interrompido sem sua confirmação: se houver panes rodando, o app avisa antes e restaura todos depois
de reiniciar. Cada pacote de atualização é assinado; o app recusa pacotes com assinatura inválida.
