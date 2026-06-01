# CryptoVault

Sistema web de criptografia de arquivos com painel administrativo, moderação de contas e notificações por e-mail.

Desenvolvido como projeto acadêmico na **FATEC** utilizando React no frontend e Python (Flask) no backend.

---

## Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Tecnologias](#tecnologias)
- [Funcionalidades](#funcionalidades)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como executar](#como-executar)
- [Configuração de e-mail (EmailJS)](#configuração-de-e-mail-emailjs)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts Python standalone](#scripts-python-standalone)
- [Acesso ao sistema](#acesso-ao-sistema)

---

## Sobre o projeto

O CryptoVault permite que usuários autenticados criptografem e descriptografem arquivos usando **AES-128-GCM**, com chave única gerada por arquivo. O sistema conta com painel administrativo completo para gerenciamento de usuários, logs de auditoria e sistema de moderação com notificações automáticas por e-mail.

---

## Tecnologias

### Frontend
| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| React | 18.3 | Framework da interface |
| Vite | 6.0 | Build tool e dev server |
| JavaScript (JSX) | ES2023 | Linguagem principal |
| CSS Vanilla | — | Estilização sem frameworks |
| EmailJS Browser | — | Envio de e-mails pelo frontend |

### Backend
| Tecnologia | Uso |
|-----------|-----|
| Python 3 | Linguagem do backend |
| Flask | Servidor web / API REST |
| Flask-CORS | Requisições cross-origin |
| PyCryptodome | Criptografia AES-128-GCM |

### Serviços
| Serviço | Uso |
|---------|-----|
| EmailJS | Envio de e-mails sem servidor de e-mail próprio |
| GitHub | Versionamento do código |
| localStorage | Persistência de dados no browser |

---

## Funcionalidades

### Usuário comum
- Cadastro e login com validação de senha forte
- Criptografar arquivos (PDF, Word, Excel, TXT, CSV)
- Descriptografar arquivos com a chave gerada
- Histórico de arquivos da sessão

### Administrador
- Painel com logs de todas as atividades
- Gerenciamento de usuários (visualizar, desbanir)
- Configuração de alertas in-app
- Histórico completo de moderação (audit trail)

### Sistema de segurança
- **Rate limiting**: bloqueia e alerta após 5 tentativas de login em 15 minutos
- **Detecção de credencial inválida**: alerta após 5 erros seguidos
- **Ban automático**: usuário é banido após 3 falhas de descriptografia
- **Allowlist de extensões**: apenas extensões permitidas são aceitas para upload
- **Notificações por e-mail**: admin e usuário são notificados nos eventos críticos

### Notificações por e-mail
| Evento | Destinatário |
|--------|-------------|
| Usuário banido | Admin (e-mail do perfil) + Usuário banido |
| Atividade suspeita | Admin (e-mail do perfil) |
| Conta reativada | Usuário desbanido |

---

## Estrutura do projeto

```
cryptovault/
├── backend/
│   ├── app.py              # Servidor Flask (API de criptografia)
│   └── requirements.txt    # Dependências Python
├── src/
│   ├── App.jsx             # Componentes e páginas React
│   ├── store.jsx           # Gerenciamento de estado (useReducer)
│   ├── config.js           # Configurações e variáveis de ambiente
│   ├── crypto.jsx          # Utilitários de criptografia (Web Crypto)
│   ├── emailService.js     # Serviço de e-mail (EmailJS)
│   ├── persistence.js      # Persistência via localStorage
│   ├── icons.jsx           # Ícones SVG
│   ├── main.jsx            # Entrada da aplicação
│   └── styles.css          # Estilos globais
├── encrypted128.py         # Script standalone — criptografar (AES-128)
├── encrypted256.py         # Script standalone — criptografar (AES-256)
├── decrypted128.py         # Script standalone — descriptografar (AES-128)
├── decrypted256.py         # Script standalone — descriptografar (AES-256)
├── .env                    # Variáveis de ambiente (não vai para o GitHub)
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

---

## Como executar

### Pré-requisitos
- Node.js 18+
- Python 3.10+

### 1. Clonar o repositório

```bash
git clone https://github.com/britoporttus/CryptoVault.git
cd CryptoVault
```

### 2. Configurar variáveis de ambiente

Crie o arquivo `.env` na raiz do projeto (veja a seção [Variáveis de ambiente](#variáveis-de-ambiente)).

### 3. Iniciar o backend Python

```bash
cd backend
pip install -r requirements.txt
python app.py
```

O backend estará disponível em `http://localhost:5000`.

### 4. Iniciar o frontend React

Em outro terminal, na raiz do projeto:

```bash
npm install
npm run dev
```

O frontend estará disponível em `http://localhost:5173`.

> **Importante:** os dois servidores precisam estar rodando ao mesmo tempo para o sistema funcionar.

---

## Configuração de e-mail (EmailJS)

O sistema usa [EmailJS](https://www.emailjs.com) para envio de e-mails diretamente do frontend, sem necessidade de servidor de e-mail próprio.

### Passo a passo

1. Crie uma conta gratuita em [emailjs.com](https://www.emailjs.com)
2. Vá em **Email Services** → adicione um serviço Gmail ou Outlook
3. Vá em **Email Templates** → crie os templates abaixo
4. Vá em **Account** → copie a **Public Key**
5. Preencha o `.env` com os IDs gerados

### Templates necessários

#### `ban_admin` — Notifica o admin quando um usuário é banido
```
To Email : {{to_email}}
Subject  : [CryptoVault] Usuário banido: {{user_name}}

Olá, Administrador.

Um usuário foi banido automaticamente no CryptoVault.

Usuário:   {{user_name}}
E-mail:    {{user_email}}
Motivo:    {{trigger}}
Data/Hora: {{timestamp}}

Para revisar: {{review_link}}
```

#### `ban_user` — Notifica o usuário que sua conta foi banida
```
To Email : {{to_email}}
Subject  : [CryptoVault] Sua conta foi suspensa

Olá, {{user_name}}.

Sua conta no CryptoVault foi suspensa por atividade suspeita.

Motivo:    {{trigger}}
Data/Hora: {{timestamp}}

Entre em contato com o administrador para solicitar revisão.
```

#### `suspicious` — Notifica o admin sobre atividade suspeita
```
To Email : {{to_email}}
Subject  : [CryptoVault] ⚠️ Atividade suspeita detectada

Olá, Administrador.

Uma atividade suspeita foi detectada no CryptoVault.

Tipo:      {{activity_type}}
Detalhe:   {{detail}}
Data/Hora: {{timestamp}}

Acesse o painel: {{review_link}}
```

#### `unban` — Notifica o usuário que sua conta foi reativada
```
To Email : {{to_email}}
Subject  : [CryptoVault] Sua conta foi reativada

Olá, {{user_name}}.

Sua conta no CryptoVault foi reativada.

Reativado por: {{admin_name}}
Motivo:        {{reason}}
Data/Hora:     {{timestamp}}

Você já pode fazer login normalmente.
```

---

## Variáveis de ambiente

Crie o arquivo `.env` na raiz do projeto com o seguinte conteúdo:

```env
# EmailJS
VITE_EMAILJS_SERVICE_ID=           # service_xxxxxxx
VITE_EMAILJS_PUBLIC_KEY=           # chave pública da conta EmailJS

# Templates
VITE_EMAILJS_TEMPLATE_BAN=         # template_xxxxxxx
VITE_EMAILJS_TEMPLATE_BAN_USER=    # template_xxxxxxx
VITE_EMAILJS_TEMPLATE_SUSPICIOUS=  # template_xxxxxxx
VITE_EMAILJS_TEMPLATE_UNBAN=       # template_xxxxxxx

# URL do backend Python (padrão: localhost)
VITE_API_URL=http://localhost:5000

# Limites de segurança (opcionais — valores padrão abaixo)
# VITE_LOGIN_MAX_ATTEMPTS=5        # tentativas de login por janela
# VITE_LOGIN_WINDOW_MS=900000      # janela de tempo em ms (15 min)
# VITE_LOGIN_MAX_FAILS=5           # erros de credencial antes do alerta
# VITE_DECRYPT_MAX_FAILS=3         # falhas de descriptografia antes do ban
# VITE_ALLOWED_EXTENSIONS=.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv
```

> O arquivo `.env` **não é enviado ao GitHub** (está no `.gitignore`). Cada desenvolvedor deve criá-lo localmente.

---

## Scripts Python standalone

Os scripts podem ser usados de forma independente, sem o sistema web. Os arquivos gerados por eles são **100% compatíveis** com o site.

### Criptografar

```bash
# AES-128 (chave de 32 hex)
python encrypted128.py arquivo.pdf

# AES-256 (chave de 64 hex)
python encrypted256.py arquivo.pdf
```

A chave é exibida no terminal e salva em `key.bin`. O arquivo criptografado é gerado com extensão `.encrypted`.

### Descriptografar

```bash
# AES-128
python decrypted128.py arquivo.pdf.encrypted

# AES-256
python decrypted256.py arquivo.pdf.encrypted
```

### Dependência necessária

```bash
pip install pycryptodome
```

### Formato do arquivo `.encrypted`

```
[12 bytes — IV/Nonce]
[N bytes  — ciphertext]
[16 bytes — tag de autenticação GCM]
```

---

## Acesso ao sistema

### Credenciais padrão do administrador

| Campo | Valor |
|-------|-------|
| E-mail | `admin@cryptovault.local` |
| Senha | `Admin@123` |

> Em produção, altere as credenciais padrão no arquivo `src/store.jsx`.

### Requisitos de senha para novos usuários

- Mínimo 8 caracteres
- Uma letra maiúscula
- Uma letra minúscula
- Um número
- Um caractere especial (`!@#$%...`)

---

## Algoritmo de criptografia

| Especificação | Detalhe |
|--------------|---------|
| Algoritmo | AES-128-GCM |
| Chave | 16 bytes (exibida como 32 caracteres hex) |
| IV/Nonce | 12 bytes aleatórios por arquivo |
| Tag | 16 bytes (autenticação GCM) |
| Geração | Backend Python (PyCryptodome) |

---

## Licença

Projeto acadêmico — FATEC. Uso educacional.
