const express = require('express')
const Router = express.Router()
const MensagensController = require('../../controllers/mensagens/MensagemController.js')

Router.get('/mensagem/usuario/:idusuario', MensagensController.listarMensagens)
Router.get('/mensagem/conversa/:idusuario1/:idusuario2', MensagensController.buscarConversa)
Router.get('/mensagem/:idmensagem', MensagensController.buscarMensagem)
Router.post('/mensagem', MensagensController.enviarMensagem)
Router.put('/mensagem/:idmensagem/ler', MensagensController.marcarComoLida)
Router.put('/mensagem/ler-varias', MensagensController.marcarVariasComoLidas)
Router.get('/mensagem/:idusuario/nao-lidas', MensagensController.contarNaoLidas)
Router.delete('/mensagem/:idmensagem', MensagensController.deletarMensagem)
Router.get('/conversas/:idusuario', MensagensController.listarConversas)

module.exports = Router