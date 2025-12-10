const express = require('express')
const Router = express.Router()
const MensagensController = require('../../controllers/mensagens/MensagemController.js')

// mobile

Router.post('/mensagem/mobile', MensagensController.enviarMensagemMobile)
Router.get('/mensagem/mobile/conversa/:idusuario/:idhospedagem', MensagensController.buscarConversaMobile)
Router.get('/mensagem/mobile/conversas/:idusuario', MensagensController.listarConversasMobile)

// web

Router.post('/mensagem/web', MensagensController.enviarMensagemWeb)
Router.get('/mensagem/web/conversa/:idhospedagem/:idusuario', MensagensController.buscarConversaWeb)
Router.get('/mensagem/web/conversas/:idhospedagem', MensagensController.listarConversasWeb)

Router.put('/mensagem/:idmensagem/ler', MensagensController.marcarComoLida)

module.exports = Router