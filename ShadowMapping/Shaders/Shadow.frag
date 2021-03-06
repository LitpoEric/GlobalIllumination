uniform sampler2D shadowMap;
uniform sampler2D vertexMap;
uniform sampler2D normalMap;
uniform mat4 MV;
uniform mat4 lightMV;
uniform mat4 lightP;
uniform mat4 mQuantization;
uniform mat4 mQuantizationInverse;
uniform mat4 lightMVPInv;
uniform mat3 normalMatrix;
uniform vec4 tQuantization;
uniform vec3 lightPosition;
uniform vec3 cameraPosition;
uniform float shadowIntensity;
uniform int shadowMapWidth;
uniform int shadowMapHeight;
uniform int bilinearPCF;
uniform int tricubicPCF;
uniform int VSM;
uniform int ESM;
uniform int EVSM;
uniform int MSM;
uniform int naive;
uniform int zNear;
uniform int zFar;
uniform int kernelOrder;
uniform int penumbraSize;
uniform mat4 MVP;
uniform mat4 lightMVP;
varying vec2 f_texcoord;

float linearize(float depth) {

	float n = float(zNear);
	float f = float(zFar);
	depth = (2.0 * n) / (f + n - depth * (f - n));
	return depth;

}

vec4 cubic(float v){

    vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
    vec4 s = n * n * n;
    float x = s.x;
    float y = s.y - 4.0 * s.x;
    float z = s.z - 4.0 * s.y + 6.0 * s.x;
    float w = 6.0 - x - y - z;
    return vec4(x, y, z, w) * (1.0/6.0);

}


vec4 textureBicubic(sampler2D sampler, vec2 texCoords){

   vec2 texSize = vec2(textureSize(sampler, 0));
   vec2 invTexSize = 1.0 / texSize;
   
   texCoords = texCoords * texSize - 0.5;
	
   vec2 fxy = fract(texCoords);
   texCoords -= fxy;

   vec4 xcubic = cubic(fxy.x);
   vec4 ycubic = cubic(fxy.y);

   vec4 c = texCoords.xxyy + vec2(-0.5, +1.5).xyxy;
    
   vec4 s = vec4(xcubic.xz + xcubic.yw, ycubic.xz + ycubic.yw);
   vec4 offset = c + vec4(xcubic.yw, ycubic.yw) / s;
    
   offset *= invTexSize.xxyy;
    
   vec4 sample0 = texture(sampler, offset.xz);
   vec4 sample1 = texture(sampler, offset.yz);
   vec4 sample2 = texture(sampler, offset.xw);
   vec4 sample3 = texture(sampler, offset.yw);

   float sx = s.x / (s.x + s.y);
   float sy = s.z / (s.z + s.w);

   return mix(mix(sample3, sample2, sx), mix(sample1, sample0, sx), sy);

}

float PCF(vec3 normalizedShadowCoord)
{

	float incrWidth = 1.0/float(shadowMapWidth);
	float incrHeight = 1.0/float(shadowMapHeight);
	float illuminationCount = 0;
	int numberOfSamples = kernelOrder * kernelOrder;
	float offset = float(penumbraSize);
	float stepSize = 2 * offset/float(kernelOrder);
	float distanceFromLight;
	int count = 0;
	
	for(float w = -offset; w < offset; w+=stepSize) {
		for(float h = -offset; h < offset; h+=stepSize) {
		
			if(tricubicPCF == 1)
				distanceFromLight = textureBicubic(shadowMap, vec2(normalizedShadowCoord.s + w * incrWidth, normalizedShadowCoord.t + h * incrHeight)).z;
			if(bilinearPCF == 1)
				distanceFromLight = texture2D(shadowMap, vec2(normalizedShadowCoord.s + w * incrWidth, normalizedShadowCoord.t + h * incrHeight)).z;
			
			if(normalizedShadowCoord.z <= distanceFromLight) illuminationCount++;
			else illuminationCount += shadowIntensity;

			count++;

		}
	}

	return float(illuminationCount)/float(count);

}

float chebyshevUpperBound(vec2 moments, float distanceToLight)
{
	
	if (distanceToLight <= moments.x)
		return 1.0;
	
	float variance = moments.y - (moments.x * moments.x);
	float d = distanceToLight - moments.x;
	float p_max = variance / (variance + d*d);
	float p = distanceToLight <= moments.x;
	p_max = max(p, p_max);
	return mix(p_max, 1.0, shadowIntensity);

}

float varianceShadowMapping(vec3 normalizedShadowCoord)
{
	
	vec2 moments = texture2D(shadowMap, vec2(normalizedShadowCoord.st)).xy;
	normalizedShadowCoord.z = linearize(normalizedShadowCoord.z);
	return chebyshevUpperBound(moments, normalizedShadowCoord.z);

}


float exponentialShadowMapping(vec3 normalizedShadowCoord)
{

	float c = 80.0;
	float e2 = texture2D(shadowMap, vec2(normalizedShadowCoord.st)).x;
	e2 = exp(c * e2);

	normalizedShadowCoord.z = linearize(normalizedShadowCoord.z);
	float e1 = exp(-c * normalizedShadowCoord.z);
	
	return clamp(e1 * e2, shadowIntensity, 1.0);

}


float exponentialVarianceShadowMapping(vec3 normalizedShadowCoord)
{

	normalizedShadowCoord.z = linearize(normalizedShadowCoord.z);
	
	vec2 moments = texture2D(shadowMap, vec2(normalizedShadowCoord.st)).xy;
	float variance = chebyshevUpperBound(moments, normalizedShadowCoord.z);

	float c = 60.0;
	float e1 = exp(-c * normalizedShadowCoord.z);
	float e2 = exp(c * texture2D(shadowMap, vec2(normalizedShadowCoord.st)).z);
	float exponential = clamp(e1 * e2, shadowIntensity, 1.0);
	
	return min(variance, exponential);

}

float hamburger4MSM(vec3 normalizedShadowCoord)
{

	vec3 z, c, d;
	vec4 b = texture2D(shadowMap, vec2(normalizedShadowCoord.st));
	b = mQuantizationInverse * (b - tQuantization);
	float bias = 0.00003;
	
	z.x = linearize(normalizedShadowCoord.z);
	b = (1.0 - bias) * b + bias * vec4(0.5, 0.5, 0.5, 0.5);
	d = vec3(1.0, z.x, z.x * z.x);

	//Use Cholesky decomposition (LDLT) to solve c
	float L10 = b.x;
	float L20 = b.y;
	float D11 = b.y - L10 * L10;
	float L21 = (b.z - L20 * L10)/D11;
	float D22 = b.w - L20 * L20 - L21 * L21 * D11;
	
	float y0 = d.x;
	float y1 = d.y - L10 * y0;
	float y2 = d.z - L20 * y0 - L21 * y1;

	y1 /= D11;
	y2 /= D22;
	
	c.z = y2;
	c.y = y1 - L21 * c.z;
	c.x = y0 - L10 * c.y - L20 * c.z;	

	// Solve the quadratic equation c[0]+c[1]*z+c[2]*z^2 to obtain solutions z[1] and z[2]
	float p = c.y/c.z;
	float q = c.x/c.z;
	float D = ((p*p)/4.0)-q;
	float r = sqrt(D);
	z.y = -(p/2.0)-r;
	z.z = -(p/2.0)+r;
	
	if(z.x <= z.y)
		return 1.0;
	else if(z.x <= z.z)
		return clamp((1.0 - clamp((z.x * z.z - b.x * (z.x + z.z) + b.y)/((z.z - z.y) * (z.x - z.y)), 0.0, 1.0)), shadowIntensity, 1.0);
	else 
		return clamp((1.0 - clamp(1.0 - (z.y * z.z - b.x * (z.y + z.z) + b.y)/((z.x - z.y) * (z.x - z.z)), 0.0, 1.0)), shadowIntensity, 1.0);
	
}

float computePreEvaluationBasedOnNormalOrientation(vec4 vertex, vec4 normal)
{

	vertex = MV * vertex;
	normal.xyz = normalize(normalMatrix * normal.xyz);

	vec3 L = normalize(lightPosition.xyz - vertex.xyz);   
	
	if(!bool(normal.w))
		normal.xyz *= -1;

	if(max(dot(normal.xyz,L), 0.0) == 0) 
		return shadowIntensity;
	else
		return 1.0;

}

void main()
{	

	vec4 vertex = texture2D(vertexMap, f_texcoord);	
	if(vertex.x == 0.0) discard; //Discard background scene

	vec4 normal = texture2D(normalMap, f_texcoord);
	vec4 shadowCoord = lightMVP * vertex;
	vec4 normalizedShadowCoord = shadowCoord / shadowCoord.w;
	float shadow = computePreEvaluationBasedOnNormalOrientation(vertex, normal);
	
	if(shadowCoord.w > 0.0 && shadow == 1.0) {

		if(naive == 1) {
			float distanceFromLight = texture2D(shadowMap, vec2(normalizedShadowCoord.st)).z;		
			shadow = (normalizedShadowCoord.z <= distanceFromLight) ? 1.0 : shadowIntensity; 
		}
		else if(VSM == 1)
			shadow = varianceShadowMapping(normalizedShadowCoord.xyz);
		else if(ESM == 1)
			shadow = exponentialShadowMapping(normalizedShadowCoord.xyz);
		else if(EVSM == 1)
			shadow = exponentialVarianceShadowMapping(normalizedShadowCoord.xyz);
		else if(MSM == 1)
			shadow = hamburger4MSM(normalizedShadowCoord.xyz);
		else
			shadow = PCF(normalizedShadowCoord.xyz);

	}
	
	//shadow = linearize(texture2D(shadowMap, vec2(gl_FragCoord.x/1024.0, gl_FragCoord.y/1024.0)).z);
	gl_FragColor = vec4(shadow, 0.0, 0.0, 1.0);
	
}