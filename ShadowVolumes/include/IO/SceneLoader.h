#ifndef SCENELOADER_H
#define SCENELOADER_H

#include <fstream>
#include <sstream>
#include <iostream>
#include "Mesh.h"

class SceneLoader
{

public:
	SceneLoader(char *filename, Mesh *mesh);
	void load();
	float* getCameraPosition() { return cameraPosition; }
	float* getCameraAt() { return cameraAt; }
	float* getLightPosition() { return lightPosition; }
	float* getLightAt() { return lightAt; }
private:
	Mesh *mesh;
	std::fstream file;
	float cameraPosition[3];
	float cameraAt[3];
	float lightPosition[3];
	float lightAt[3];
};

#endif