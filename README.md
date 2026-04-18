# Editor de Música (Holyrics Simplificado)

Este é um projeto **React + Vite** focado na edição, normalização e exportação de letras de músicas e mídias associadas (áudio, imagens e QR Codes) para utilização em sistemas de apresentação como o Holyrics. O projeto foi projetado para rodar completamente no navegador, garantindo segurança e agilidade.

---

## 🚀 Como iniciar e rodar os Scripts (Scripts Model)

Este projeto usa Node.js e gerenciador de pacotes NPM. Para iniciar o ambiente, siga os passos:

### 1. Instalar as Dependências
Na pasta principal do projeto, abra seu terminal e rode o comando de instalação:
```bash
npm install
```

### 2. Rodar em Ambiente de Desenvolvimento
Para iniciar o servidor local de testes, utilize:
```bash
npm run dev
```
Após executar, acesse o link gerado (ex: `http://localhost:5173`) no seu navegador. O servidor será modificado e atualizado instantaneamente a cada edição salva.

### 3. Criar versão de Produção (Build)
Para compilar o código em um pacote de produção hiper-otimizado (que será publicado/hospedado), rode:
```bash
npm run build
```
O código final minificado e pronto será colocado na pasta `/dist/`.

### 4. Visualizar Produção Local
Para rodar a pasta `/dist/` em um ambiente seguro de testes antes de subir online, rode:
```bash
npm run preview
```

---

## 📖 Documentação de Uso e Funcionalidades

O projeto oferece as seguintes abas e recursos:

### 📥 1. Importação de Arquivos e Pastas
Você pode abrir ou arrastar arquivos ou diretórios inteiros no sistema de arquivos do lado esquerdo.
- **Arquivos Suportados**: `.mufl`, `.hbac`, `.ppt` (apenas leitura simulada do texto das slides), `.txt` (Padrão Holyrics), `.zip`
Ao carregar uma pasta com várias músicas, você pode navegar pela "grade lateral" para carregar a música desejada instantaneamente.

### ✍️ 2. Edição de Texto e Rápida Normalização
O painel central possui ações rápidas essenciais:
- **Remover Linhas Duplas**: O sistema vai remover linhas ou estrofes idênticas preservando apenas conteúdo único.
- **Organizar Estrofes**: Padroniza os espaços brancos das estrofes baseado no layout padrão `.txt` do Holyrics.
- **Ações Inteligentes com IA (ChatGPT / Gemini / Claude)**: Configurando uma `API Key` na coluna da direita você pode melhorar, otimizar textos em lote de forma algorítmica direto pelo navegador.

### 📸 3. Inserção de Mídias (Sidebars)
- **Fundo da Apresentação:** No canto superior direito, em `Escolher foto`, selecione uma Imagem que servirá como textura de slide.
- **Pequeno Ícone (Favicon):** Adicone a marca através do `Subir Favicon`. O Favicon reflete imediatamente na aba do seu browser.
- **QR Code de Doações:** No setor inferior direito se encontra a suíte de painel para inserir o logo com as Doações do Ministério/Igreja, exibido junto a outras mídias suportadas. Permite o upload da fotografia de Chave PIX, etc.
- **Áudio MP3**: O envio de áudio fica disponível como player em tempo real acima da área de edição.

### 📦 4. Exportação Geral (Download)
Após preparar e editar todo o conteúdo (Textos + Mídias):
- Clique em **Salvar (Exportar ZIP)** para gerar um único arquivo compactado com tudo atrelado: formato final unificado `.txt`, `.hbac` e `.mufl` ao lado das imagens, áudio e QR codes escolhidos para serem diretamente arrastados no painel de sua mesa de operação final.

---

## 🛠️ Tecnologias e Bibliotecas Utilizadas
- **React 19**
- **Vite 6** (Servidor Rápido de Build)
- **JSZip** (Responsável por fazer toda a extração de pacotes originais `.zip` / `.ppt` e gerar os pacotes finais exportados).
- **ZXing Browser** (Scan de leitor de barras e QR codes utilizando webcam local).
- **QRCode.React** (Geração dinâmica e renderização visual do QR Code).
- **Puppeteer** (Motor auxiliar).
