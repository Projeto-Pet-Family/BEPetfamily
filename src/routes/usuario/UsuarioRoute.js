const express = require('express')
const Router = express.Router()
const UsuarioController = require('../../controllers/usuario/UsuarioController.js')

Router.get('/usuarios', UsuarioController.lerUsuarios)
Router.post('/usuarios', UsuarioController.inserirUsuario)
Router.put('/usuarios/:idUsuario', UsuarioController.atualizarUsuario)
Router.delete('/usuarios/:idUsuario', UsuarioController.excluirUsuario)

module.exports = Router