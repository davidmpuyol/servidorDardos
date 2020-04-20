process.env.PWD = process.cwd()
var express = require("express");
var app = express();
app.use(express.static(__dirname+'/public'));
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`)
  } else {
    next();
  }
});
/*
app.get('*', function(req, res) {
  res.sendFile(`${__dirname}/public/index.html`);
});*/

var datos = {
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
}
var sigPartida = "visitante";

var turno = "j1";

function nuevaPartida(){
  datos['local'].puntos = 501;
  datos['local'].tiradas = [];
  datos['visitante'].puntos = 501;
  datos['visitante'].tiradas = [];
  datos.turno = sigPartida;
  sigPartida = sigPartida == "local" ? "visitante" : "local";
}

io.on('connection', function(socket){
    console.log(socket.id+" conectado");
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
        socket.broadcast.emit('bye');
      });
      socket.on('comenzarPartida',function(){
        io.emit('comenzarPartida',datos);
      })
      socket.on('tirada',function(data){
        datos[datos.turno].puntos -= data.puntos;
        datos[datos.turno].tiradas.push(data.puntos);
        datos[datos.turno].nDardos += data.dardos;
        datos[datos.turno].puntosHechos += data.puntos;
        datos[datos.turno].media = (datos[datos.turno].puntosHechos/datos[datos.turno].nDardos*3).toFixed(2);
        if(datos[datos.turno].puntos == 0){
          io.emit('ganador', datos.turno);
          nuevaPartida();
          io.emit('comenzarPartida',datos);
        }
        else{
          datos.turno = datos.turno == "local" ? "visitante" : "local";
          io.emit('tirada', datos);
        }
      })
});
http.listen(process.env.PORT || 3000, function(){
  console.log('listening on *:3000');
});

