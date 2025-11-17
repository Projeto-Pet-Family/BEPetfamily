// routes/mensagensRoute.js
const express = require('express')
const Router = express.Router()
const MensagensController = require('../../controllers/mensagens/MensagemController.js')
  
Router.get('/mensagem/usuario/:idusuario', MensagensController.listarMensagens)
Router.get('/mensagem/conversa/:idusuario1/:idusuario2', MensagensController.buscarConversa)
Router.get('/mensagens/:idmensagem', MensagensController.buscarMensagem)
Router.post('/mensagem', MensagensController.enviarMensagem)
Router.put('/mensagem/:idmensagem/ler', MensagensController.marcarComoLida)
Router.put('/mensagem/ler-varias', MensagensController.marcarVariasComoLidas)
Router.put('/mensagem/:idmensagem/arquivar', MensagensController.arquivarMensagem)
Router.get('/mensagem/:idusuario/nao-lidas', MensagensController.contarNaoLidas)
Router.delete('mensagem/:idmensagem', MensagensController.deletarMensagem)

module.exports = Router