EXECDIR=$PWD

# this file's directory
SOURCEDIR="$(dirname "$BASH_SOURCE")"

# cd to this file's directory to look up docker-compose.yml
cd "$SOURCEDIR"
docker compose up -d

# since docker compose is complete, cd back to origin execution dir
cd "$EXECDIR"