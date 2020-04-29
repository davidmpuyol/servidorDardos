process.env.PWD = process.cwd()
var express = require("express");
var app = express();
var MongoClient = require("mongodb").MongoClient;
var mongoURL = 'mongodb://marco:marcocuma@37.35.151.96:27017?authMechanism=SCRAM-SHA-1&authSource=admin';
app.use(express.static(__dirname+'/public'));
var http = require('http').createServer(app);
//Modulo de encriptación
const bcrypt = require('bcrypt');
const saltRounds = 12;

var io = require('socket.io')(http);
var usuariosConectados = {}
function compruebaUsuarios(){
    let idClientes = Object.keys(io.sockets.sockets)
    let userDisc = []
    console.log(idClientes)
    Object.keys(usuariosConectados).forEach((user) => {
      if(!idClientes.includes(usuariosConectados[user].id)){
        userDisc.push(user)
        delete usuariosConectados[user]
      }
    })
    return userDisc
}

var dbo = null;
var db = null;
MongoClient.connect(mongoURL, (err, db)=>{
  if (err) return err;
  db = db;
  dbo = db.db("dardos");
})

//Genera un codigo aleatorio que sera el localizador de la sesion del usuario con la base de datos
function codigo(){
  let valores = "0123456789abcdefABCDEF?¿¡!:;_-ç";
  let longitud = 40;
  let code = "";
  for (x=0; x < longitud; x++)
  {
    rand = Math.floor(Math.random()*valores.length);
    code += valores.substr(rand, 1);
  }
  return code;
}

//le introduces un string y te lo encipta
function encriptar(password){
  return bcrypt.hash(password, saltRounds)
  .then(function(hashedPassword) {
      return hashedPassword;
  })
}
/*encriptar('prueba').then((respuesta)=>{
  console.log(respuesta)
})*/

//compara una contraseña con una contraseña encriptada
function comparar(password,passcript){
  return bcrypt.compare(password, passcript).then(function (same) {
    return same;
  })
}
//loguea al usuario en la base de datos y le devuelve el codigo de la sesion.
function login(mail ,password, socket){
    //obtengo los datos del usuario con ese mail de registro
    var query = { email: mail };
    dbo.collection("usuarios").find(query).toArray((err, result)=>{
      if (err) return err;
      let criptpass = result[0].password
      comparar(password , criptpass).then((result)=>{console.log(result)})
      if (comparar(password , criptpass)){

        //general el codigo aleatorio para identificar la sesion
        let codigoRand =result[0].nick+codigo();

        //crear una marca de tiempo para saber cuando se logueo
        let time = Date.now()
        let datos = {$set :{online: true, online_id: codigoRand, lastLogin: time}}
        //obtiene los datos que mandara al cliente de vuelta

        let user = {nick:result[0].nick,email:result[0].email,idSession:codigoRand}

        //cambia los datos en la bd y manda un evento al cliente para que este guarde el id de sesion para asi poder indentificarse
        dbo.collection("usuarios").updateOne(query, datos, (err, res)=>{
          if (err) return err;
          //db.close();
        });
        socket.emit('respLogin',user)
      }
    });
}
function comprobarSesion(id,socket){
  //Comprueba si hay una sesion con ese id abierta y manda los datos de vuelta al usuario
    let query = {online_id: id}
    dbo.collection("usuarios").find(query).toArray((err, result)=>{
      console.log(result)
      if(result.length > 0){
        if(result[0].online == true){
          let user = {nick:result[0].nick,email:result[0].email,idSession:id}
          socket.emit('respLogin',user)
        }
      }
    })
}
function logout(id){
    //obtengo los datos del usuario con ese mail de registro
    var query = { online_id: id };
    dbo.collection("usuarios").find(query).toArray(function(err, result) {
          let datos = {$set :{online: false, online_id: ''}}
          let user = result[0]
          //cambia los datos en la bd y manda un evento al cliente para que este guarde el id de sesion para asi poder indentificarse
          dbo.collection("usuarios").updateOne(user, datos, function(err, res) {
            if (err) throw err;
          });
      })
}
//desloguea a los usuarios que llevan logueados mas de una hora
let IntervaloLogin = setInterval(function(){
    //obtengo los datos del usuario con ese mail de registro
    var query = { online: true };
    dbo.collection("usuarios").find(query).toArray(function(err, result) {
      result.forEach((user)=>{
        if((Date.now()-user.lastLogin)>3600000){
          let datos = {$set :{online: false, online_id: ''}}
          //cambia los datos en la bd y manda un evento al cliente para que este guarde el id de sesion para asi poder indentificarse
          dbo.collection("usuarios").updateOne(user, datos, function(err, res) {
            if (err) throw err;
            console.log('Datos modificados '+res)
          });
        }
      })
    });
},1800000)

/*
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`)
  } else {
    next();
  }
});


/* app.get('*', function(req, res) {
  res.redirect(`https://${req.header('host')}${req.url}`);
}); */

function nuevaPartida(id){
  partidas[id]['local'].puntos = 501;
  partidas[id]['local'].tiradas = [];
  partidas[id]['visitante'].puntos = 501;
  partidas[id]['visitante'].tiradas = [];
  partidas[id].turno = partidas[id].sigPartida;
  partidas[id].sigPartida = partidas[id].sigPartida == "local" ? "visitante" : "local";
}

var partidas = {};

io.on('connection', function(socket){
      console.log(socket.id+" conectado");
      socket.emit('user','estas conectado')
      socket.on('userConected',(usr)=>{
        usuariosConectados[usr] = {id:socket.id,ready:false};
        console.log(usuariosConectados)
        io.emit('listaUsuarios',usuariosConectados)
      });
      socket.on('mensaje',(msg) => {
        console.log(msg)
        if(msg.userDest == 'general')
          io.emit('reenvio',msg)
        else
          io.sockets.in(msg['dest']).emit('reenvio',msg)
      })
      socket.on('login',function(datos){
        login(datos.email,datos.password,socket)
      })
      socket.on('comprobarSesion',function(id){
        comprobarSesion(id,socket)
      })
      socket.on('logout',function(id){
        logout(id)
      })
      socket.on('preparado', function() {
        console.log(socket.id+' preparado');
        socket.broadcast.emit('preparado');
      });
      socket.on('offer', function (message) {
        socket.broadcast.emit('offer', message);
      });
      socket.on('answer', function (message) {
        socket.broadcast.emit('answer', message);
      });
      socket.on('candidate', function (message) {
        socket.broadcast.emit('candidate', message);
      });
      socket.on('disconnect', function() {
        console.log(socket.id+" desconectado");
        let usuarioDesc = compruebaUsuarios()
        io.emit('usuarioDesc',usuarioDesc)
        socket.broadcast.emit('bye');
      });
      socket.on('checked',(clave) => {
        console.log('entra en el checked')
        usuariosConectados[clave].ready=!usuariosConectados[clave].ready
        io.emit('cambEstado',clave)
      })
      socket.on('comenzarPartida',function(){
        let id = codigo();
        turno: "local"
        partidas[id] = {
          idPartida: id,
          local: {
            puntos: 501,
            media: 0,
            puntosHechos: 0,
            nDardos: 0,
            tiradas: [],
          },
          visitante: {
            puntos: 501,
            media: 0,
            puntosHechos: 0,
            nDardos: 0,
            tiradas: [],
          },
          turno: "local",
          sigPartida: "visitante"
        }
        io.emit('comenzarPartida',partidas[id]);
      })
      socket.on('tirada',function(data){
        let idPartida = data.idPartida;
        let turno = data.turno;
        partidas[idPartida][turno].puntos -= data.puntos;
        partidas[idPartida][turno].tiradas.push(data.puntos);
        partidas[idPartida][turno].nDardos += data.dardos;
        partidas[idPartida][turno].puntosHechos += data.puntos;
        partidas[idPartida][turno].media = (partidas[idPartida][turno].puntosHechos/partidas[idPartida][turno].nDardos*3).toFixed(2);
        if(partidas[idPartida][turno].puntos == 0){
          io.emit('ganador', partidas[idPartida].turno);
          nuevaPartida(idPartida);
          io.emit('comenzarPartida',partidas[idPartida]);
        }
        else{
          partidas[idPartida].turno = partidas[idPartida].turno == "local" ? "visitante" : "local";
          io.emit('tirada', partidas[idPartida]);
        }
      })
});
http.listen(process.env.PORT || 3000, function(){
  console.log('listening on *:3000');
});

