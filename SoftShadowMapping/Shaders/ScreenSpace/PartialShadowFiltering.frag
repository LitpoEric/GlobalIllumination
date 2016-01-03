uniform sampler2D vertexMap;
uniform sampler2D normalMap;
uniform sampler2D shadowMap;
uniform sampler2D hardShadowMap;
uniform mat4 lightMVP;
uniform mat4 inverseLightMVP;
uniform mat4 MVP;
uniform mat4 MV;
uniform mat3 normalMatrix;
uniform float shadowIntensity;
uniform float fov;
uniform float sigmaColor;
uniform float sigmaSpace;
uniform float blockerThreshold;
uniform int kernelSize;
uniform int blockerSearchSize;
uniform int lightSourceRadius;
uniform int windowWidth;
uniform int windowHeight;
uniform int shadowMapWidth;
uniform int shadowMapHeight;
uniform int SSPCSS;
uniform int SSABSS;
uniform int SSSM;
varying vec2 f_texcoord;

float computeAverageBlockerDepthBasedOnSSPCSS() {

	float averageDepth = 0.0;
	float numberOfBlockers = 0;
	vec2 blockerSearch = vec2(lightSourceRadius)/vec2(windowWidth, windowHeight);
	vec2 stepSize = 2.0 * blockerSearch/float(blockerSearchSize);
	vec2 shadow = vec2(0.0);
	
	float space = 0.0;
	float color = 0.0;
	float value = texture2D(hardShadowMap, f_texcoord.xy).g;
	float weight = 0.0;
	float invSigmaColor = 0.5f / (sigmaColor * sigmaColor);
	float invSigmaSpace = 0.5f / (sigmaSpace * sigmaSpace);

	for(float h = -blockerSearch.y; h <= blockerSearch.y; h += stepSize.y) {
		
		shadow = texture2D(hardShadowMap, vec2(f_texcoord.xy + vec2(0.0, h))).rg;
			
		if(shadow.r == shadowIntensity) {
			
			space = h * h;
			color = (value - shadow.g) * (value - shadow.g);
			weight = exp(-(space * invSigmaSpace + color * invSigmaColor));
			averageDepth += weight * shadow.g;
			numberOfBlockers += weight;

		}

	}

	if(numberOfBlockers == 0)
		return value;
	else
		return averageDepth / numberOfBlockers;

}

float computeAverageBlockerDepthBasedOnSSABSS(vec4 normalizedShadowCoord) {

	float averageDepth = 0.0;
	float numberOfBlockers = 0;
	vec2 blockerSearch = vec2(lightSourceRadius)/vec2(shadowMapWidth, shadowMapHeight);
	vec2 stepSize = 2.0 * blockerSearch/float(blockerSearchSize);
	vec2 shadow = vec2(0.0);

	for(float w = -blockerSearch.x; w <= blockerSearch.x; w += stepSize.x) {
		for(float h = -blockerSearch.y; h <= blockerSearch.y; h += stepSize.y) {
		
			float distanceFromLight = texture2D(shadowMap, vec2(normalizedShadowCoord.xy + vec2(w, h))).z;
			if(normalizedShadowCoord.z > distanceFromLight) {
				averageDepth += distanceFromLight;
				numberOfBlockers++;
			}

		}
	}

	if(numberOfBlockers == 0)
		return 1.0;
	else
		return averageDepth / numberOfBlockers;

}

vec2 computeAverageBlockerDepthBasedOnSSSM(vec4 normalizedShadowCoord) {

	float averageDepth = 0.0;
	float numberOfBlockers = 0;
	vec2 blockerSearch = vec2(lightSourceRadius)/vec2(shadowMapWidth, shadowMapHeight);
	vec2 stepSize = 2.0 * blockerSearch/float(blockerSearchSize);
	vec2 value = texture2D(hardShadowMap, f_texcoord.xy).gb;
	vec4 temp = normalizedShadowCoord;
	float distance = texture2D(shadowMap, normalizedShadowCoord.xy).z;

	for(float h = -blockerSearch.y; h <= blockerSearch.y; h += stepSize.y) {
		
		float currentDistance = texture2D(shadowMap, normalizedShadowCoord.xy + vec2(0.0, h)).z;
		if(abs(distance - currentDistance) < blockerThreshold) {
	
			temp.y = normalizedShadowCoord.y + h;
			vec4 world = inverseLightMVP * temp;
			vec4 camera = MVP * world;
			vec2 averageDepth = texture2D(hardShadowMap, ((camera.xy/camera.w) + 1.0) * 0.5).gb;
			//vec2 averageDepth = texture2D(hardShadowMap, vec2(f_texcoord.xy + vec2(0.0, 1.0/float(windowHeight)))).gb;
			value += averageDepth;
	
		} else {

			for(float w = -blockerSearch.x; w <= blockerSearch.x; w += stepSize.x) {
		
				float distanceFromLight = texture2D(shadowMap, vec2(normalizedShadowCoord.xy + vec2(w, h))).z;
				if(normalizedShadowCoord.z > distanceFromLight) {
					value.r += distanceFromLight;
					value.g++;
				}

			}
	
		}

	}

	if(value.g == 0)
		return 1.0;
	else
		return value.r / value.g;

}

float computePenumbraWidth(float averageDepth, float distanceToLight, vec4 vertex) {
	
	if(averageDepth < 0.99) 
		return 0.0;

	float deye = -(MV * vertex).z/100.0;
	float dscreen = 1.0/(2.0 * tan(fov/2.0));
	float penumbraWidth = ((distanceToLight - averageDepth)/averageDepth) * float(lightSourceRadius);
	return dscreen * penumbraWidth/deye;

}

float bilateralShadowFiltering(float penumbraWidth) {

	float shadow = 0.0;
	float illuminationCount = 0.0;
	float count = 0.0;
	float stepSize = 2.0 * penumbraWidth/float(kernelSize);
		
	if(stepSize <= 0.0 || stepSize >= 1.0)
		return 1.0;

	float space = 0.0;
	float color = 0.0;
	float value = texture2D(hardShadowMap, f_texcoord.xy).r;
	float weight = 0.0;
	float invSigmaColor = 0.5f / (sigmaColor * sigmaColor);
	float invSigmaSpace = 0.5f / (sigmaSpace * sigmaSpace);
	float sigma = 1.0;

	for(float w = -penumbraWidth; w <= penumbraWidth; w += stepSize) {
		
		shadow = texture2D(hardShadowMap, vec2(f_texcoord.xy + vec2(w, 0.0))).r;

		if(shadow > 0.0) {

			space = w * w;
			color = (value - shadow) * (value - shadow);
			if(SSABSS == 1) sigma = normalize(normalMatrix * texture2D(normalMap, f_texcoord.xy).xyz).z * 1000.0;
			weight = exp(-(space * invSigmaSpace + color * invSigmaColor)/sigma);
			illuminationCount += weight * shadow;
			count += weight;

		}

	}
		
	return illuminationCount/count;
	
}

vec2 gaussianShadowFiltering(float penumbraWidth) {

	float shadow = 0.0;
	float illuminationCount = 0.0;
	float count = 0.0;
	float stepSize = 2.0 * penumbraWidth/float(kernelSize);
	float invSigmaSpace = 0.5f / (sigmaSpace * sigmaSpace);
	
	if(stepSize <= 0.0 || stepSize >= 1.0)
		return vec2(1.0, 1.0);

	for(float w = -penumbraWidth; w <= penumbraWidth; w += stepSize) {
		
		shadow = texture2D(hardShadowMap, vec2(f_texcoord.xy + vec2(w, 0.0))).r;
		if(shadow > 0.0) {
			float weight = exp(-(w * w * invSigmaSpace));
			illuminationCount += weight * shadow;
			count += weight;
		}
	
	}

	return vec2(illuminationCount, count);

}

void main()
{	

	vec2 shadow = texture2D(hardShadowMap, f_texcoord.xy).rg;	
	
	if(shadow.r > 0.0) {
	
		vec4 vertex = texture2D(vertexMap, f_texcoord);
		vec4 shadowCoord = lightMVP * vertex;
		vec4 normalizedShadowCoord = shadowCoord / shadowCoord.w;
		
		float averageDepth; 
		if(SSPCSS == 1) averageDepth = computeAverageBlockerDepthBasedOnSSPCSS();
		else if(SSABSS == 1) averageDepth = computeAverageBlockerDepthBasedOnSSABSS(normalizedShadowCoord);
		else if(SSSM == 1) averageDepth = computeAverageBlockerDepthBasedOnSSSM(normalizedShadowCoord);
		
		float penumbraWidth = computePenumbraWidth(averageDepth, normalizedShadowCoord.z, vertex);
		if(SSPCSS == 1 || SSABSS == 1) {
			shadow.r = bilateralShadowFiltering(penumbraWidth);
			gl_FragColor = vec4(shadow.r, penumbraWidth, 0.0, 1.0);
		} else if(SSSM == 1) {
			vec2 shadowFiltering = gaussianShadowFiltering(penumbraWidth);
			gl_FragColor = vec4(shadow.r, penumbraWidth, shadowFiltering);
		}

	} else {

		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
	
	}

}