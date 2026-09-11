export interface StoreLogo {
  name: string;
  src: string;
  /** Logos com arte clara/transparente precisam de um fundo escuro para ficarem visíveis. */
  onDark?: boolean;
  /** Quando o arquivo de origem não tem um nome legível, mostra o nome da loja como texto. */
  textOnly?: boolean;
}
