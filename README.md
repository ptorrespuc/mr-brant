# Mr.Brant — Artigos Religiosos

Site institucional e catálogo de artigos religiosos de Umbanda (imagens sacras pintadas à mão).

O site é **um único arquivo** `index.html`, autossuficiente — todas as imagens e estilos já estão embutidos. Basta abrir no navegador. Não precisa de build, servidor ou dependências.

## Como subir para o GitHub

O repositório já existe: https://github.com/ptorrespuc/mr-brant

```bash
# 1. Clone o repositório (ainda vazio)
git clone https://github.com/ptorrespuc/mr-brant.git
cd mr-brant

# 2. Copie o index.html (e este README, se quiser) para dentro da pasta

# 3. Faça o commit e o push
git add .
git commit -m "Site Mr.Brant — Artigos Religiosos"
git push origin main
```

## Publicar no ar (GitHub Pages) — grátis

1. No GitHub, vá em **Settings → Pages**
2. Em **Source**, escolha a branch `main` e a pasta `/ (root)`
3. Salve. Em alguns minutos o site estará no ar em:
   **https://ptorrespuc.github.io/mr-brant**

(O arquivo precisa se chamar `index.html` na raiz — já está assim.)

## O que já está configurado

- **WhatsApp:** +55 21 97564-6365 (todos os botões de pedido já apontam para esse número)
- **Catálogo:** 4 imagens cadastradas — Exu Caveira, Oxum, Maria Padilha das Almas e Maria Padilha Rainha das Sete Encruzilhadas
- **Categorias:** toda a estrutura (Imagens + 12 subcategorias, Velas, Guias e Colares, etc.) — as categorias ainda sem produtos mostram "Em breve"
- **Funcionalidades:** sacola (carrinho) que persiste, finalização do pedido pelo WhatsApp, calculadora de frete (estimativa), e dois temas (escuro/claro) no botão ☾ do topo

## ⚠️ Ainda como valores iniciais (ajuste quando quiser)

- **Preços** ("a partir de"): Exu R$ 89,90 · Oxum R$ 79,90 · Maria Padilha das Almas R$ 189,90 · Rainha das Sete Encruzilhadas R$ 219,90
- A **calculadora de frete** dá uma *estimativa*; o valor final é combinado no WhatsApp. Integração real com a API dos Correios exige um back-end (posso orientar separadamente).

## Editar conteúdo

Para mudar preços, textos, adicionar produtos ou trocar o número de WhatsApp de forma estruturada, o ideal é editar o projeto-fonte (onde o site foi construído) e gerar um novo `index.html`. O `index.html` final é compilado/minificado e não foi feito para edição manual.
