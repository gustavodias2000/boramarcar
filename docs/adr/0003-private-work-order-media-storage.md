# Fotos de OS usam armazenamento privado por empresa e OS

As fotos de OS serão guardadas em um bucket privado, com o caminho contendo empresa, OS e etapa. Escolhemos validar esse caminho tanto no Storage quanto no registro de mídia para que uma URL, um objeto ou um metadado não concedam acesso fora da empresa.

## Consequências

O cliente faz upload com sessão autenticada e solicita a URL assinada quando precisa exibir a foto. O bucket não deve ser tornado público, mesmo para simplificar a primeira interface.
