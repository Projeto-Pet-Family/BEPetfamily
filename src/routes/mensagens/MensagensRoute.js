// routes/mensagensRoute.js
const express = require('express')
const Router = express.Router()
const MensagensController = require('../../controllers/mensagensController.js')

Router.get('/usuario/:idusuario', MensagensController.listarMensagens)
Router.get('/conversa/:idusuario1/:idusuario2', MensagensController.buscarConversa)
Router.get('/:idmensagem', MensagensController.buscarMensagem)
Router.post('/', MensagensController.enviarMensagem)
Router.put('/:idmensagem/ler', MensagensController.marcarComoLida)
Router.put('/ler-varias', MensagensController.marcarVariasComoLidas)
Router.put('/:idmensagem/arquivar', MensagensController.arquivarMensagem)
Router.get('/:idusuario/nao-lidas', MensagensController.contarNaoLidas)
Router.delete('/:idmensagem', MensagensController.deletarMensagem)

module.exports = Router