varying vec3 N;
varying vec3 v;
uniform mat4 MVP;
uniform mat4 MV;
uniform mat3 normalMatrix;
uniform vec3 lightPosition;
uniform vec3 cameraPosition;
attribute vec3 vertex;
attribute vec3 normal;

void main(void)
{

   v = vec3(MV * vec4(vertex, 1));       
   N = normalize(normalMatrix * normal);
   
   gl_Position = MVP  * vec4(vertex, 1);
   gl_FrontColor = gl_Color;

}
