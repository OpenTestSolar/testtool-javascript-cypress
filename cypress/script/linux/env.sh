#! /bin/bash

set -e

TOOL_ROOT=$(dirname $(dirname $(dirname $(readlink -fm $0))))
echo ${TOOL_ROOT}

cd ${TOOL_ROOT}
echo ${TESTSOLAR_WORKSPACE}
export CYPRESS_CACHE_FOLDER=${TESTSOLAR_WORKSPACE}